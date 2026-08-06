/* ============================================================
   Ledgerly — views.js
   Screen renderers. Each returns a DOM node for the content
   area. `ctx` = { range, refresh(), navigate(route) }.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const S = L.Store, M = L.Modals, C = L.Charts;
  const el = L.el, cur = () => S.workspace.currency;

  function card(title, sub, bodyNodes, headExtra) {
    const c = el('div', { class: 'card card--pad' });
    if (title) {
      const h = el('div', { class: 'card__head' });
      const left = el('div', {}, [el('div', { class: 'card__title', text: title }), sub ? el('div', { class: 'card__sub', text: sub }) : null]);
      h.appendChild(left);
      if (headExtra) h.appendChild(headExtra);
      c.appendChild(h);
    }
    (Array.isArray(bodyNodes) ? bodyNodes : [bodyNodes]).forEach((n) => n && c.appendChild(n));
    return c;
  }

  function statCard({ icon, iconBg, label, value, delta, deltaKind }) {
    const s = el('div', { class: 'stat' });
    s.innerHTML = `
      <div class="stat__ic" style="background:${iconBg || 'var(--accent-soft)'};">${icon}</div>
      <div class="stat__label">${L.escape(label)}</div>
      <div class="stat__value tabular">${value}</div>
      ${delta != null ? `<div class="stat__delta stat__delta--${deltaKind || 'up'}">${delta}</div>` : ''}
    `;
    return s;
  }

  function txnRow(t, catMap, onClick) {
    const c = catMap.get(t.categoryId) || { icon: '❓', color: '#94A3B8', name: 'Uncategorized' };
    const row = el('div', { class: 'txn-row' });
    row.innerHTML = `
      <div class="txn-ic" style="background:${hexA(c.color, 0.14)};color:${c.color}">${c.icon}</div>
      <div class="txn-main">
        <div class="txn-vendor">${L.escape(t.vendor || c.name)}</div>
        <div class="txn-meta">
          <span>${L.escape(c.name)}</span><span class="txn-dot"></span>
          <span>${L.escape(t.method || '')}</span>
          ${t.receiptId ? '<span class="txn-dot"></span><span title="Has receipt">🧾</span>' : ''}
          ${t.tags && t.tags.length ? '<span class="txn-dot"></span><span>' + t.tags.map((x) => '#' + L.escape(x)).join(' ') + '</span>' : ''}
        </div>
      </div>
      <div>
        <div class="txn-amt ${t.type === 'income' ? 'txn-amt--income' : ''}">${t.type === 'income' ? '+' : '−'}${L.money(t.amount, t.currency)}</div>
        <div class="txn-sub">${L.relDate(t.date)}</div>
      </div>`;
    row.onclick = () => onClick(t);
    return row;
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function emptyState(icon, title, msg, actionLabel, onAction) {
    const e = el('div', { class: 'empty' });
    e.innerHTML = `<div class="empty__ic">${icon}</div><div class="empty__title">${L.escape(title)}</div><div>${L.escape(msg)}</div>`;
    if (actionLabel) {
      const b = el('button', { class: 'btn btn--primary', text: actionLabel, style: 'margin-top:16px' });
      b.onclick = onAction; e.appendChild(b);
    }
    return e;
  }

  /* Range selector used across dashboard/reports */
  function rangeSelect(ctx) {
    const sel = el('select', { class: 'select', style: 'width:auto' });
    [['this-month','This month'],['last-month','Last month'],['last-30','Last 30 days'],['last-90','Last 90 days'],['ytd','Year to date'],['last-year','Last year'],['all','All time']].forEach(([v, t]) => {
      const o = el('option', { value: v, text: t }); if (ctx.rangeName === v) o.selected = true; sel.appendChild(o);
    });
    sel.onchange = () => { ctx.setRange(sel.value); };
    return sel;
  }

  const Views = {
    /* ================= DASHBOARD ================= */
    async dashboard(ctx) {
      const snap = await S.snapshot(ctx.range);
      const wrap = el('div', { class: 'page-enter' });

      // Compare to previous equivalent period
      const prev = prevRange(ctx.range);
      const prevSnap = await S.snapshot(prev);
      const expDelta = pctDelta(snap.totalExpense, prevSnap.totalExpense);
      const incDelta = pctDelta(snap.totalIncome, prevSnap.totalIncome);

      const stats = el('div', { class: 'stats' });
      stats.appendChild(statCard({
        icon: '💸', iconBg: hexA('#FF385C', .12), label: 'Total expenses', value: L.money(snap.totalExpense, cur()),
        delta: deltaLabel(expDelta, true), deltaKind: expDelta > 0 ? 'down' : 'up',
      }));
      stats.appendChild(statCard({
        icon: '💰', iconBg: hexA('#16A34A', .14), label: 'Total income', value: L.money(snap.totalIncome, cur()),
        delta: deltaLabel(incDelta, false), deltaKind: incDelta >= 0 ? 'up' : 'down',
      }));
      stats.appendChild(statCard({
        icon: snap.net >= 0 ? '📈' : '📉', iconBg: hexA(snap.net >= 0 ? '#16A34A' : '#DC2626', .12),
        label: 'Net profit', value: L.money(snap.net, cur()),
        delta: snap.net >= 0 ? 'Positive cash flow' : 'Spending exceeds income', deltaKind: snap.net >= 0 ? 'up' : 'down',
      }));
      stats.appendChild(statCard({
        icon: '🧾', iconBg: hexA('#7C3AED', .12), label: 'Tax deductible', value: L.money(snap.deductible, cur()),
        delta: `${snap.expenseCount} expenses tracked`, deltaKind: 'neutral',
      }));
      wrap.appendChild(stats);

      // Main grid
      const grid = el('div', { class: 'dash-grid' });

      // Left: trend + monthly bars
      const left = el('div', { class: 'stack' });

      const trendHead = el('div', { class: 'segment' });
      // trend card
      const daily = S.dailySeries(snap.expenses, ctx.range);
      const trendCard = card('Spending trend', ctx.range.label, [C.area(daily, { currency: cur() })], rangeSelect(ctx));
      left.appendChild(trendCard);

      const barsCard = card('Income vs. expenses', 'Last 6 months', [
        C.bars(snap.series, { currency: cur() }),
        legendRow([['var(--income)', 'Income'], ['var(--accent)', 'Expenses']]),
      ]);
      left.appendChild(barsCard);

      grid.appendChild(left);

      // Right: category donut + budgets
      const right = el('div', { class: 'stack' });
      const donutData = snap.byCat.slice(0, 6).map((c) => ({ label: c.name, value: c.total, color: c.color }));
      if (snap.byCat.length > 6) {
        const rest = L.sum(snap.byCat.slice(6), (c) => c.total);
        donutData.push({ label: 'Other', value: rest, color: '#CBD5E1' });
      }
      const donutHolder = el('div', { style: 'display:flex;justify-content:center' });
      if (donutData.length) {
        donutHolder.appendChild(C.donut(donutData, { centerTop: L.moneyShort(snap.totalExpense, cur()), centerBottom: 'spent' }));
      } else {
        donutHolder.appendChild(emptyState('🍩', 'No expenses yet', 'Add your first expense to see the breakdown.'));
      }
      const legend = el('div', { class: 'legend' });
      snap.byCat.slice(0, 7).forEach((c) => {
        const pct = snap.totalExpense ? Math.round((c.total / snap.totalExpense) * 100) : 0;
        const item = el('div', { class: 'legend__item' });
        item.innerHTML = `<span class="legend__swatch" style="background:${c.color}"></span>
          <span class="legend__name">${c.icon} ${L.escape(c.name)}</span>
          <span class="legend__val tabular">${L.money(c.total, cur())}</span>
          <span class="legend__pct">${pct}%</span>`;
        item.onclick = () => ctx.navigate('transactions?cat=' + c.id);
        legend.appendChild(item);
      });
      right.appendChild(card('By category', ctx.range.label, [donutHolder, legend]));

      // Budgets mini
      const budgetBody = el('div', {});
      if (snap.budgetStatus.length) {
        snap.budgetStatus.slice(0, 4).forEach((b) => budgetBody.appendChild(budgetItem(b)));
        const viewAll = el('button', { class: 'btn btn--subtle btn--sm btn--block', text: 'Manage budgets', style: 'margin-top:12px' });
        viewAll.onclick = () => ctx.navigate('budgets');
        budgetBody.appendChild(viewAll);
      } else {
        budgetBody.appendChild(emptyState('🎯', 'No budgets set', 'Set spending limits to stay on track.', 'Create a budget', () => M.budget(null, ctx.refresh)));
      }
      right.appendChild(card('Budgets', 'This month', [budgetBody]));

      grid.appendChild(right);
      wrap.appendChild(grid);

      // Recent transactions
      const recentBody = el('div', {});
      const recent = snap.inRange.slice().sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt)).slice(0, 8);
      if (recent.length) {
        recent.forEach((t, i) => {
          recentBody.appendChild(txnRow(t, snap.catMap, (tx) => M.transaction(tx, ctx.refresh)));
          if (i < recent.length - 1) recentBody.appendChild(el('div', { class: 'list-divider' }));
        });
      } else {
        recentBody.appendChild(emptyState('📭', 'No transactions in this period', 'Try a different date range or add one.'));
      }
      const seeAll = el('button', { class: 'btn btn--ghost btn--sm', text: 'View all →' });
      seeAll.onclick = () => ctx.navigate('transactions');
      wrap.appendChild(el('div', { style: 'margin-top:16px' }, [card('Recent activity', null, [recentBody], seeAll)]));

      return wrap;
    },

    /* ================= TRANSACTIONS ================= */
    async transactions(ctx) {
      const [txns, cats, accts] = await Promise.all([S.transactions(), S.categories(), S.accounts()]);
      const catMap = new Map(cats.map((c) => [c.id, c]));
      const wrap = el('div', { class: 'page-enter' });

      // state
      const state = { q: '', cat: ctx.params.cat || 'all', type: 'all', acct: 'all', from: '', to: '', tag: '' };

      // Filter bar
      const bar = el('div', { class: 'filterbar' });
      const search = el('div', { class: 'search-input' });
      search.innerHTML = `<span class="si">🔍</span>`;
      const searchInput = el('input', { class: 'input', placeholder: 'Search vendor, note, tag, amount…' });
      search.appendChild(searchInput);
      bar.appendChild(search);

      const typeSel = el('select', { class: 'select' });
      [['all','All types'],['expense','Expenses'],['income','Income']].forEach(([v,t]) => typeSel.appendChild(el('option', { value: v, text: t })));
      const catSel = el('select', { class: 'select' });
      catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
      cats.forEach((c) => { const o = el('option', { value: c.id, text: `${c.icon} ${c.name}` }); if (c.id === state.cat) o.selected = true; catSel.appendChild(o); });
      const acctSel = el('select', { class: 'select' });
      acctSel.appendChild(el('option', { value: 'all', text: 'All accounts' }));
      accts.forEach((a) => acctSel.appendChild(el('option', { value: a.id, text: `${a.icon} ${a.name}` })));
      bar.appendChild(typeSel); bar.appendChild(catSel); bar.appendChild(acctSel);

      const exportBtn = el('button', { class: 'btn btn--ghost btn--sm', html: '⬇ Export CSV', style: 'margin-left:auto' });
      const addBtn = el('button', { class: 'btn btn--primary btn--sm', html: '＋ Add' });
      bar.appendChild(exportBtn); bar.appendChild(addBtn);
      wrap.appendChild(bar);

      const summary = el('div', { class: 'row', style: 'gap:16px;margin-bottom:12px;flex-wrap:wrap' });
      const listCard = card(null, null, []);
      const listBody = el('div', {});
      listCard.appendChild(listBody);
      wrap.appendChild(summary);
      wrap.appendChild(listCard);

      function apply() {
        state.q = searchInput.value.toLowerCase().trim();
        state.type = typeSel.value; state.cat = catSel.value; state.acct = acctSel.value;
        let filtered = txns.filter((t) => {
          if (state.type !== 'all' && t.type !== state.type) return false;
          if (state.cat !== 'all' && t.categoryId !== state.cat) return false;
          if (state.acct !== 'all' && t.accountId !== state.acct) return false;
          if (state.q) {
            const c = catMap.get(t.categoryId);
            const hay = [t.vendor, t.note, (t.tags || []).join(' '), c && c.name, String(t.amount), t.method].join(' ').toLowerCase();
            if (!hay.includes(state.q)) return false;
          }
          return true;
        });
        filtered.sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
        renderList(filtered);
        // summary
        const exp = L.sum(filtered.filter((t) => t.type === 'expense'), (t) => S.baseAmount(t));
        const inc = L.sum(filtered.filter((t) => t.type === 'income'), (t) => S.baseAmount(t));
        summary.innerHTML = `
          <span class="chip">${filtered.length} transactions</span>
          <span class="chip chip--accent">Expenses ${L.money(exp, cur())}</span>
          <span class="chip chip--income">Income ${L.money(inc, cur())}</span>
          <span class="chip">Net ${L.money(inc - exp, cur())}</span>`;
      }

      function renderList(list) {
        listBody.innerHTML = '';
        if (!list.length) { listBody.appendChild(emptyState('🔍', 'No matching transactions', 'Try adjusting your filters.')); return; }
        // group by day
        const groups = L.groupBy(list, (t) => t.date);
        for (const [date, items] of groups) {
          const dayTotal = L.sum(items.filter((t) => t.type === 'expense'), (t) => S.baseAmount(t));
          const dh = el('div', { class: 'day-header' });
          dh.innerHTML = `<span>${L.relDate(date)} · ${L.fmtDate(date, 'day')}</span><span class="muted tabular">${L.money(dayTotal, cur())}</span>`;
          listBody.appendChild(dh);
          items.forEach((t) => listBody.appendChild(txnRow(t, catMap, (tx) => M.transaction(tx, ctx.refresh))));
        }
      }

      searchInput.oninput = L.debounce(apply, 160);
      typeSel.onchange = catSel.onchange = acctSel.onchange = apply;
      addBtn.onclick = () => M.transaction(null, ctx.refresh);
      exportBtn.onclick = () => exportTxnsCSV(txns, catMap, accts);
      apply();
      return wrap;
    },

    /* ================= REPORTS ================= */
    async reports(ctx) {
      const snap = await S.snapshot(ctx.range);
      const wrap = el('div', { class: 'page-enter' });

      const bar = el('div', { class: 'filterbar' });
      bar.appendChild(rangeSelect(ctx));
      const printBtn = el('button', { class: 'btn btn--ghost btn--sm', html: '🖨 Print / PDF', style: 'margin-left:auto' });
      const csvBtn = el('button', { class: 'btn btn--ghost btn--sm', html: '⬇ Category CSV' });
      const taxBtn = el('button', { class: 'btn btn--primary btn--sm', html: '🧾 Tax report' });
      bar.appendChild(csvBtn); bar.appendChild(printBtn); bar.appendChild(taxBtn);
      wrap.appendChild(bar);

      // headline
      const stats = el('div', { class: 'stats' });
      stats.appendChild(statCard({ icon: '💸', iconBg: hexA('#FF385C', .12), label: 'Expenses', value: L.money(snap.totalExpense, cur()) }));
      stats.appendChild(statCard({ icon: '💰', iconBg: hexA('#16A34A', .14), label: 'Income', value: L.money(snap.totalIncome, cur()) }));
      stats.appendChild(statCard({ icon: '📊', iconBg: hexA('#7C3AED', .12), label: 'Net', value: L.money(snap.net, cur()) }));
      stats.appendChild(statCard({ icon: '🧾', iconBg: hexA('#0891B2', .12), label: 'Deductible', value: L.money(snap.deductible, cur()) }));
      wrap.appendChild(stats);

      const two = el('div', { class: 'two-col', style: 'margin-top:16px' });
      // category breakdown table
      const tbl = el('div', { class: 'tbl-wrap' });
      let rows = snap.byCat.map((c) => `<tr>
        <td><span class="row"><span class="txn-ic" style="width:30px;height:30px;font-size:15px;background:${hexA(c.color,.14)};color:${c.color}">${c.icon}</span> ${L.escape(c.name)}</span></td>
        <td class="num">${c.count}</td>
        <td class="num">${L.money(c.total, cur())}</td>
        <td class="num">${snap.totalExpense ? Math.round(c.total / snap.totalExpense * 100) : 0}%</td>
      </tr>`).join('');
      tbl.innerHTML = `<table class="tbl"><thead><tr><th>Category</th><th class="num">#</th><th class="num">Amount</th><th class="num">Share</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted" style="text-align:center;padding:24px">No expenses</td></tr>'}</tbody></table>`;
      two.appendChild(card('Expenses by category', ctx.range.label, [tbl]));

      // monthly table + bars
      two.appendChild(card('Monthly summary', 'Last 6 months', [
        C.bars(snap.series, { currency: cur() }),
        legendRow([['var(--income)', 'Income'], ['var(--accent)', 'Expenses']]),
      ]));
      wrap.appendChild(two);

      // Vendors table
      const vend = vendorBreakdown(snap.expenses, cur());
      wrap.appendChild(el('div', { style: 'margin-top:16px' }, [card('Top vendors', ctx.range.label, [vend])]));

      csvBtn.onclick = () => {
        const rows = snap.byCat.map((c) => [c.name, c.count, c.total.toFixed(2), (snap.totalExpense ? (c.total / snap.totalExpense * 100).toFixed(1) : 0) + '%']);
        L.download(`ledgerly-categories-${ctx.range.from}_${ctx.range.to}.csv`, L.toCSV(rows, ['Category', 'Count', 'Total', 'Share']), 'text/csv');
      };
      printBtn.onclick = () => window.print();
      taxBtn.onclick = () => {
        if (ctx.ent && !ctx.ent.can('taxReports')) { L.toast('Tax reports are a Pro feature', 'error'); return ctx.navigate('billing'); }
        Views._taxReport(ctx, snap);
      };
      if (ctx.ent && !ctx.ent.can('taxReports')) taxBtn.innerHTML = '🔒 Tax report';
      return wrap;
    },

    async _taxReport(ctx, snap) {
      const deductibleTxns = snap.expenses.filter((t) => t.deductible).sort((a, b) => a.date.localeCompare(b.date));
      const total = L.sum(deductibleTxns, (t) => S.baseAmount(t));
      const byCat = L.groupBy(deductibleTxns, (t) => t.categoryId);
      const body = el('div', {});
      body.innerHTML = `<p class="muted" style="margin-top:0">Deductible expenses for <strong>${L.escape(S.workspace.name)}</strong> · ${L.fmtDate(ctx.range.from)} – ${L.fmtDate(ctx.range.to)}</p>
        <div class="stat" style="margin:14px 0"><div class="stat__label">Total deductible</div><div class="stat__value">${L.money(total, cur())}</div></div>`;
      let rows = '';
      for (const [cid, items] of byCat) {
        const c = snap.catMap.get(cid);
        rows += `<tr><td>${c ? c.icon + ' ' + L.escape(c.name) : '—'}</td><td class="num">${items.length}</td><td class="num">${L.money(L.sum(items, (t) => S.baseAmount(t)), cur())}</td></tr>`;
      }
      const tbl = el('div', { class: 'tbl-wrap' });
      tbl.innerHTML = `<table class="tbl"><thead><tr><th>Category</th><th class="num">Items</th><th class="num">Deductible</th></tr></thead><tbody>${rows || '<tr><td colspan=3 class=muted style="text-align:center">None flagged deductible</td></tr>'}</tbody></table>`;
      body.appendChild(tbl);
      const dl = el('button', { class: 'btn btn--primary btn--block', text: '⬇ Download detailed CSV', style: 'margin-top:16px' });
      dl.onclick = () => {
        const rows = deductibleTxns.map((t) => { const c = snap.catMap.get(t.categoryId); return [t.date, t.vendor, c ? c.name : '', t.method, S.baseAmount(t).toFixed(2)]; });
        L.download(`tax-deductible-${ctx.range.from}_${ctx.range.to}.csv`, L.toCSV(rows, ['Date', 'Vendor', 'Category', 'Method', 'Amount ' + cur()]), 'text/csv');
      };
      body.appendChild(dl);
      simpleModal('Tax & deductible report', body);
    },

    /* ================= BUDGETS ================= */
    async budgets(ctx) {
      const snap = await S.snapshot(L.rangePreset('this-month'));
      const wrap = el('div', { class: 'page-enter' });
      const add = el('button', { class: 'btn btn--primary btn--sm', html: '＋ New budget' });
      add.onclick = () => M.budget(null, ctx.refresh);
      const head = card('Monthly budgets', L.monthLabelLong(L.today().slice(0, 7)), [], add);

      const body = el('div', {});
      if (!snap.budgetStatus.length) {
        body.appendChild(emptyState('🎯', 'No budgets yet', 'Set monthly limits per category to control spending and get alerts.', 'Create your first budget', () => M.budget(null, ctx.refresh)));
      } else {
        const totalBudget = L.sum(snap.budgetStatus, (b) => b.amount);
        const totalSpent = L.sum(snap.budgetStatus, (b) => b.spent);
        const overall = el('div', { class: 'card', style: 'padding:16px;margin-bottom:16px;background:var(--surface-2)' });
        overall.innerHTML = `<div class="row" style="justify-content:space-between"><div style="font-weight:700">Overall</div><div class="tabular">${L.money(totalSpent, cur())} <span class="muted">/ ${L.money(totalBudget, cur())}</span></div></div>`;
        const p = el('div', { class: 'progress', style: 'margin-top:10px' });
        const pct = totalBudget ? totalSpent / totalBudget : 0;
        p.appendChild(el('div', { class: 'progress__bar' + (pct > 1 ? ' progress__bar--over' : ''), style: `width:${Math.min(100, pct * 100)}%;background:${pct > 0.9 ? 'var(--warn)' : 'var(--income)'}` }));
        overall.appendChild(p);
        body.appendChild(overall);
        snap.budgetStatus.forEach((b) => {
          const item = budgetItem(b, true);
          item.style.cursor = 'pointer';
          item.onclick = () => M.budget(b, ctx.refresh);
          body.appendChild(item);
        });
      }
      head.appendChild(body);
      wrap.appendChild(head);
      return wrap;
    },

    /* ================= RECURRING ================= */
    async recurring(ctx) {
      const [recs, cats] = await Promise.all([S.recurring(), S.categories()]);
      const catMap = new Map(cats.map((c) => [c.id, c]));
      const wrap = el('div', { class: 'page-enter' });
      const add = el('button', { class: 'btn btn--primary btn--sm', html: '＋ New recurring' });
      add.onclick = () => M.recurring(null, ctx.refresh);
      const body = el('div', {});
      if (!recs.length) {
        body.appendChild(emptyState('🔁', 'No recurring transactions', 'Automate rent, subscriptions, payroll and more. They post automatically when due.', 'Add recurring', () => M.recurring(null, ctx.refresh)));
      } else {
        recs.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
        recs.forEach((r, i) => {
          const c = catMap.get(r.categoryId) || { icon: '🔁', color: '#94A3B8', name: '—' };
          const row = el('div', { class: 'txn-row' });
          const due = r.nextDate <= L.today();
          row.innerHTML = `
            <div class="txn-ic" style="background:${hexA(c.color,.14)};color:${c.color}">${c.icon}</div>
            <div class="txn-main">
              <div class="txn-vendor">${L.escape(r.vendor || c.name)}</div>
              <div class="txn-meta"><span class="chip chip--sm">${L.titleCase(r.frequency)}</span><span class="txn-dot"></span><span>Next: ${L.fmtDate(r.nextDate)}</span>${due ? '<span class="chip chip--sm chip--accent">Due</span>' : ''}${!r.active ? '<span class="chip chip--sm">Paused</span>' : ''}</div>
            </div>
            <div><div class="txn-amt ${r.type === 'income' ? 'txn-amt--income' : ''}">${r.type === 'income' ? '+' : '−'}${L.money(r.amount, r.currency)}</div></div>`;
          row.onclick = () => M.recurring(r, ctx.refresh);
          body.appendChild(row);
          if (i < recs.length - 1) body.appendChild(el('div', { class: 'list-divider' }));
        });
      }
      wrap.appendChild(card('Recurring transactions', 'Auto-posted when due', [body], add));
      return wrap;
    },

    /* ================= CATEGORIES ================= */
    async categories(ctx) {
      const cats = (await S.categories()).sort((a, b) => (a.order || 0) - (b.order || 0));
      const wrap = el('div', { class: 'page-enter' });
      const add = el('button', { class: 'btn btn--primary btn--sm', html: '＋ New category' });
      add.onclick = () => M.category(null, ctx.refresh);

      function group(kind, title) {
        const list = cats.filter((c) => c.kind === kind);
        const body = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px' });
        list.forEach((c) => {
          const tile = el('div', { class: 'card', style: 'padding:14px;display:flex;align-items:center;gap:12px;cursor:pointer' });
          tile.innerHTML = `<div class="txn-ic" style="background:${hexA(c.color,.14)};color:${c.color}">${c.icon}</div>
            <div style="flex:1;min-width:0"><div style="font-weight:650">${L.escape(c.name)}</div>${c.deductible ? '<div class="hint" style="margin:0">Deductible</div>' : ''}</div>`;
          tile.onclick = () => M.category(c, ctx.refresh);
          body.appendChild(tile);
        });
        return card(title, `${list.length} categories`, [body]);
      }
      wrap.appendChild(el('div', { class: 'stack' }, [
        el('div', { class: 'row', style: 'justify-content:flex-end' }, [add]),
        group('expense', 'Expense categories'),
        group('income', 'Income categories'),
      ]));
      return wrap;
    },

    /* ================= ACCOUNTS ================= */
    async accounts(ctx) {
      const snap = await S.snapshot(L.rangePreset('all'));
      const wrap = el('div', { class: 'page-enter' });
      const add = el('button', { class: 'btn btn--primary btn--sm', html: '＋ New account' });
      add.onclick = () => M.account(null, ctx.refresh);

      const totalBal = L.sum(snap.balances, (b) => b.balance);
      const hero = el('div', { class: 'stat', style: 'grid-column:1/-1' });
      hero.innerHTML = `<div class="stat__label">Total balance across accounts</div><div class="stat__value tabular">${L.money(totalBal, cur())}</div>`;

      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-top:16px' });
      snap.balances.forEach((a) => {
        const tile = el('div', { class: 'card card--pad', style: 'cursor:pointer' });
        tile.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <div class="txn-ic" style="background:${hexA(a.color || '#FF385C',.14)};color:${a.color || '#FF385C'}">${a.icon}</div>
            <span class="chip chip--sm">${L.titleCase(a.type)}</span>
          </div>
          <div style="font-weight:700;margin-top:14px">${L.escape(a.name)}</div>
          <div class="stat__value tabular" style="font-size:22px;margin-top:4px;color:${a.balance < 0 ? 'var(--danger)' : 'var(--ink)'}">${L.money(a.balance, cur())}</div>
          <div class="hint" style="margin-top:4px">Opening ${L.money(a.openingBalance || 0, cur())}</div>`;
        tile.onclick = () => M.account(a, ctx.refresh);
        grid.appendChild(tile);
      });

      wrap.appendChild(card('Accounts & wallets', 'Balances reflect all transactions', [hero, grid], add));
      return wrap;
    },

    /* ================= SETTINGS ================= */
    async settings(ctx) {
      const wrap = el('div', { class: 'page-enter stack' });
      const ws = S.workspace, user = S.user;

      // Profile
      const profBody = el('div', { class: 'stack' });
      const nameF = field('Your name', el('input', { class: 'input', value: user.name }));
      const emailF = field('Email', el('input', { class: 'input', value: user.email, disabled: 'true' }));
      profBody.appendChild(el('div', { class: 'grid-2' }, [nameF.field, emailF.field]));
      const saveProf = el('button', { class: 'btn btn--primary btn--sm', text: 'Save profile', style: 'align-self:flex-start' });
      saveProf.onclick = async () => { await S.updateUser({ name: nameF.input.value.trim() }); L.toast('Profile saved'); ctx.rerenderShell && ctx.rerenderShell(); };
      profBody.appendChild(saveProf);
      wrap.appendChild(card('Your account', user.email, [profBody]));

      // Workspace
      const wsBody = el('div', { class: 'stack' });
      const wsName = field('Business / workspace name', el('input', { class: 'input', value: ws.name }));
      const curSelWrap = el('select', { class: 'select' });
      Object.values(L.CURRENCIES).forEach((c) => { const o = el('option', { value: c.code, text: `${c.symbol} ${c.name} (${c.code})` }); if (c.code === ws.currency) o.selected = true; curSelWrap.appendChild(o); });
      const curF = field('Base currency', curSelWrap);
      wsBody.appendChild(el('div', { class: 'grid-2' }, [wsName.field, curF.field]));
      const saveWs = el('button', { class: 'btn btn--primary btn--sm', text: 'Save workspace', style: 'align-self:flex-start' });
      saveWs.onclick = async () => { await S.updateWorkspace({ name: wsName.input.value.trim(), currency: curSelWrap.value }); L.toast('Workspace updated'); ctx.rerenderShell && ctx.rerenderShell(); ctx.refresh(); };
      wsBody.appendChild(saveWs);
      wrap.appendChild(card('Workspace', 'Applies to everyone in this workspace', [wsBody]));

      // Appearance
      const apprBody = el('div', {});
      const themeRow = el('div', { class: 'row', style: 'justify-content:space-between' });
      themeRow.innerHTML = `<div><div style="font-weight:650">Dark mode</div><div class="hint" style="margin:0">Easier on the eyes at night</div></div>`;
      const themeToggle = el('label', { class: 'toggle' });
      const themeCheck = el('input', { type: 'checkbox' });
      if ((localStorage.getItem('ledgerly.theme')) === 'dark') themeCheck.checked = true;
      themeToggle.appendChild(themeCheck); themeToggle.appendChild(el('span', { class: 'track' })); themeToggle.appendChild(el('span', { class: 'knob' }));
      themeCheck.onchange = () => L.setTheme(themeCheck.checked ? 'dark' : 'light');
      themeRow.appendChild(themeToggle);
      apprBody.appendChild(themeRow);
      wrap.appendChild(card('Appearance', null, [apprBody]));

      // Data management
      const dataBody = el('div', { class: 'row wrap', style: 'gap:10px' });
      const backup = el('button', { class: 'btn btn--ghost btn--sm', html: '⬇ Export backup (JSON)' });
      backup.onclick = async () => { const data = await S.exportAll(); L.download(`ledgerly-backup-${L.today()}.json`, JSON.stringify(data, null, 2), 'application/json'); L.toast('Backup downloaded'); };
      const restore = el('button', { class: 'btn btn--ghost btn--sm', html: '⬆ Import backup' });
      const restoreInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
      restore.onclick = () => restoreInput.click();
      restoreInput.onchange = () => {
        const f = restoreInput.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
          try {
            const payload = JSON.parse(r.result);
            const ok = await M.confirm({ title: 'Import backup?', message: 'This adds the backup data to your current workspace. Continue?', confirmText: 'Import' });
            if (!ok) return;
            await S.importAll(payload, { replace: false });
            L.toast('Backup imported'); ctx.refresh();
          } catch (e) { L.toast('Invalid backup file', 'error'); }
        };
        r.readAsText(f);
      };
      const importCsv = el('button', { class: 'btn btn--ghost btn--sm', html: '⬆ Import CSV' });
      importCsv.onclick = () => Views._importCSV(ctx);
      dataBody.appendChild(backup); dataBody.appendChild(restore); dataBody.appendChild(importCsv); dataBody.appendChild(restoreInput);
      wrap.appendChild(card('Data & backup', 'Your data lives privately in this browser. Back it up regularly.', [dataBody]));

      // Danger zone
      const dangerBody = el('div', { class: 'row wrap', style: 'gap:10px' });
      const wipe = el('button', { class: 'btn btn--danger btn--sm', text: 'Clear all transactions' });
      wipe.onclick = async () => { const ok = await M.confirm({ title: 'Clear all transactions?', message: 'This permanently deletes every transaction, budget and recurring item in this workspace. Categories and accounts are kept.', confirmText: 'Delete everything', danger: true }); if (!ok) return; await S.wipeWorkspaceData(); L.toast('Transactions cleared'); ctx.refresh(); };
      dangerBody.appendChild(wipe);
      wrap.appendChild(card('Danger zone', null, [dangerBody]));

      // Plan / upgrade
      const planBody = el('div', {});
      planBody.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><div><div style="font-weight:700">Current plan: <span style="color:var(--accent)">${L.titleCase(user.plan || 'free')}</span></div><div class="hint" style="margin:0">Unlock unlimited workspaces, team members & priority support.</div></div></div>`;
      const upgrade = el('a', { class: 'btn btn--primary btn--sm', href: '../index.html#pricing', text: 'View plans', style: 'margin-top:12px' });
      planBody.appendChild(upgrade);
      wrap.appendChild(card('Subscription', null, [planBody]));

      return wrap;
    },

    /* ================= PAYWALL ================= */
    async paywall(ctx, feature) {
      const B = L.Billing;
      const label = B.FEATURE_LABELS[feature] || 'This feature';
      const wrap = el('div', { class: 'page-enter' });
      const box = el('div', { class: 'card card--pad', style: 'max-width:620px;margin:24px auto;text-align:center' });
      box.innerHTML = `
        <div style="font-size:52px">🔒</div>
        <h2 style="font-size:24px;letter-spacing:-.02em;margin:12px 0 6px">${L.escape(label)} is a paid feature</h2>
        <p class="muted" style="max-width:420px;margin:0 auto">Upgrade to unlock ${L.escape(label.toLowerCase())} and everything else in Pro. Your data stays exactly where it is.</p>`;
      const cta = el('button', { class: 'btn btn--primary btn--lg', text: 'View plans & upgrade', style: 'margin-top:22px' });
      cta.onclick = () => ctx.navigate('billing');
      box.appendChild(cta);
      wrap.appendChild(box);
      return wrap;
    },

    /* ================= BILLING ================= */
    async billing(ctx) {
      const B = L.Billing;
      const ent = await S.entitlements();
      const sub = ent.sub;
      const [invoices, methods, wss] = await Promise.all([B.invoices(S.user.id), B.paymentMethods(S.user.id), S.allWorkspaces()]);
      const seatsUsed = (await S.members()).length;
      const wrap = el('div', { class: 'page-enter stack' });

      // Status banner
      const now = Date.now();
      let banner = null;
      if (sub.status === 'trialing' && now < sub.trialEnd) {
        const days = Math.ceil((sub.trialEnd - now) / 86400000);
        banner = bannerEl('🎁', `You're on the Pro free trial`, `${days} day${days === 1 ? '' : 's'} left. Add a plan any time to keep Pro features after your trial.`, '#EDE9FE', '#7C3AED');
      } else if (sub.status === 'trialing') {
        banner = bannerEl('⏰', 'Your trial has ended', 'You\'re now on the free Starter plan. Upgrade to restore Pro features.', '#FEF3C7', '#D97706');
      } else if (sub.cancelAtPeriodEnd || sub.status === 'canceled') {
        banner = bannerEl('⚠️', 'Subscription canceled', `You keep access until ${new Date(sub.currentPeriodEnd).toLocaleDateString()}.`, '#FEE2E2', '#DC2626');
      }
      if (banner) wrap.appendChild(banner);

      // Current plan + usage
      const planCard = el('div', { class: 'card card--pad' });
      const wsLimit = ent.limits.workspaces === Infinity ? '∞' : ent.limits.workspaces;
      const seatLimit = ent.limits.seats === Infinity ? '∞' : ent.limits.seats;
      planCard.innerHTML = `
        <div class="card__head"><div><div class="card__title">Current plan</div><div class="card__sub">${B.statusLabel(sub)}</div></div>
          <span class="chip" style="background:${ent.plan.color}22;color:${ent.plan.color};font-size:14px;font-weight:800">${ent.plan.name}${sub.comp ? ' · comp' : ''}</span></div>
        <div class="grid-2" style="margin-top:6px">
          <div>${meter('Workspaces', wss.length, ent.limits.workspaces, wsLimit)}</div>
          <div>${meter('Team seats', seatsUsed, ent.limits.seats, seatLimit)}</div>
        </div>`;
      wrap.appendChild(planCard);

      // Plan selector
      let cycle = sub.billingCycle === 'annual' ? 'annual' : 'monthly';
      const plansCard = el('div', { class: 'card card--pad' });
      const head = el('div', { class: 'card__head' });
      head.appendChild(el('div', {}, [el('div', { class: 'card__title', text: 'Change plan' }), el('div', { class: 'card__sub', text: 'Upgrade or downgrade any time' })]));
      const cyc = el('div', { class: 'segment' });
      const cm = el('button', { text: 'Monthly', class: cycle === 'monthly' ? 'is-active' : '' });
      const ca = el('button', { text: 'Annual · save 20%', class: cycle === 'annual' ? 'is-active' : '' });
      cyc.appendChild(cm); cyc.appendChild(ca);
      head.appendChild(cyc); plansCard.appendChild(head);
      const planGrid = el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:14px' });
      plansCard.appendChild(planGrid);
      function renderPlans() {
        planGrid.innerHTML = '';
        B.PLAN_ORDER.forEach((pid) => {
          const p = B.PLANS[pid];
          const highlight = ent.planId === pid;                       // effective plan (incl. trial)
          const isCurrent = sub.status === 'active' && sub.planId === pid; // an actually-subscribed plan
          const price = B.planPrice(pid, cycle);
          const tile = el('div', { class: 'card', style: `padding:18px;border-color:${highlight ? p.color : 'var(--line)'};${highlight ? 'box-shadow:0 0 0 2px ' + p.color + '33;' : ''}` });
          const feats = pid === 'starter'
            ? ['Unlimited transactions', 'Receipts & categories', 'Dashboard & CSV export']
            : (pid === 'pro'
              ? ['Everything in Starter', 'Recurring & budgets', 'Tax reports & multi-currency', 'Up to 3 workspaces']
              : ['Everything in Pro', 'Unlimited workspaces', 'Team members & roles', 'Vendor analytics']);
          tile.innerHTML = `
            <div style="font-weight:800;font-size:17px;color:${p.color}">${p.name}</div>
            <div class="muted" style="font-size:12.5px;min-height:34px">${p.tagline}</div>
            <div style="font-size:30px;font-weight:850;letter-spacing:-.02em;margin:6px 0">${price === 0 ? 'Free' : L.money(price, 'USD') + '<span style="font-size:13px;color:var(--ink-3);font-weight:600">/' + (cycle === 'annual' ? 'yr' : 'mo') + '</span>'}</div>
            <ul style="list-style:none;padding:0;margin:12px 0 0;display:flex;flex-direction:column;gap:7px">${feats.map((f) => `<li style="font-size:13px;display:flex;gap:7px"><span style="color:var(--income)">✓</span>${f}</li>`).join('')}</ul>`;
          const btn = el('button', { class: 'btn btn--block', style: 'margin-top:16px' });
          const trialingThis = sub.status === 'trialing' && Date.now() < sub.trialEnd && pid === ent.planId;
          if (isCurrent) { btn.classList.add('btn--subtle'); btn.textContent = 'Current plan'; btn.disabled = true; }
          else {
            const upgrading = B.PLAN_ORDER.indexOf(pid) > B.PLAN_ORDER.indexOf(ent.planId);
            btn.classList.add(upgrading || trialingThis ? 'btn--primary' : 'btn--ghost');
            btn.textContent = pid === 'starter' ? 'Downgrade to Starter' : (trialingThis ? 'Subscribe to ' + p.name : (upgrading ? 'Upgrade to ' + p.name : 'Switch to ' + p.name));
            btn.onclick = () => {
              if (pid === 'starter') {
                M.confirm({ title: 'Downgrade to Starter?', message: 'You\'ll lose Pro features at the end of your billing period. Continue?', confirmText: 'Downgrade' })
                  .then(async (ok) => { if (!ok) return; await B.downgradeToStarter(S.user.id); L.toast('Switched to Starter'); ctx.rerenderShell && ctx.rerenderShell(); ctx.refresh(); });
              } else {
                Views._checkout(ctx, pid, cycle);
              }
            };
          }
          tile.appendChild(btn);
          planGrid.appendChild(tile);
        });
      }
      cm.onclick = () => { cycle = 'monthly'; cm.classList.add('is-active'); ca.classList.remove('is-active'); renderPlans(); };
      ca.onclick = () => { cycle = 'annual'; ca.classList.add('is-active'); cm.classList.remove('is-active'); renderPlans(); };
      renderPlans();
      wrap.appendChild(plansCard);

      // Manage subscription actions
      if (ent.planId !== 'starter' && (sub.status === 'active' || sub.status === 'trialing')) {
        const manage = el('div', { class: 'card card--pad' });
        manage.appendChild(el('div', { class: 'card__title', text: 'Manage subscription', style: 'margin-bottom:12px' }));
        const row = el('div', { class: 'row wrap', style: 'gap:10px' });
        if (sub.cancelAtPeriodEnd) {
          const resume = el('button', { class: 'btn btn--primary btn--sm', text: 'Resume subscription' });
          resume.onclick = async () => { await B.resume(S.user.id); L.toast('Subscription resumed'); ctx.refresh(); };
          row.appendChild(resume);
        } else if (sub.status === 'active') {
          const cancel = el('button', { class: 'btn btn--danger btn--sm', text: 'Cancel subscription' });
          cancel.onclick = async () => { const ok = await M.confirm({ title: 'Cancel subscription?', message: 'You\'ll keep access until the end of the current period.', confirmText: 'Cancel plan', danger: true }); if (!ok) return; await B.cancel(S.user.id); L.toast('Subscription canceled'); ctx.rerenderShell && ctx.rerenderShell(); ctx.refresh(); };
          row.appendChild(cancel);
        }
        manage.appendChild(row);
        wrap.appendChild(manage);
      }

      // Payment methods
      const pmCard = el('div', { class: 'card card--pad' });
      const pmAdd = el('button', { class: 'btn btn--ghost btn--sm', text: '＋ Add card' });
      pmAdd.onclick = () => Views._addCard(ctx);
      const pmHead = el('div', { class: 'card__head' });
      pmHead.appendChild(el('div', {}, [el('div', { class: 'card__title', text: 'Payment methods' })]));
      pmHead.appendChild(pmAdd); pmCard.appendChild(pmHead);
      if (!methods.length) pmCard.appendChild(el('div', { class: 'muted', text: 'No card on file.', style: 'font-size:14px' }));
      methods.forEach((m) => {
        const r = el('div', { class: 'row', style: 'justify-content:space-between;padding:10px 0;border-top:1px solid var(--line)' });
        r.innerHTML = `<div class="row" style="gap:10px"><span style="font-size:22px">💳</span><div><div style="font-weight:650">${m.brand} •••• ${m.last4}</div><div class="hint" style="margin:0">${m.exp ? 'Expires ' + m.exp : ''}${m.isDefault ? ' · Default' : ''}</div></div></div>`;
        const rm = el('button', { class: 'btn btn--danger btn--sm', text: 'Remove' });
        rm.onclick = async () => { await B.removePaymentMethod(m.id); L.toast('Card removed'); ctx.refresh(); };
        r.appendChild(rm); pmCard.appendChild(r);
      });
      wrap.appendChild(pmCard);

      // Billing history
      const histCard = el('div', { class: 'card card--pad' });
      histCard.appendChild(el('div', { class: 'card__title', text: 'Billing history', style: 'margin-bottom:6px' }));
      if (!invoices.length) {
        histCard.appendChild(el('div', { class: 'muted', text: 'No invoices yet.', style: 'font-size:14px' }));
      } else {
        const t = el('div', { class: 'tbl-wrap' });
        t.innerHTML = `<table class="tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Description</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody></tbody></table>`;
        const tb = t.querySelector('tbody');
        invoices.forEach((inv) => {
          const tr = el('tr', {});
          const statusColor = inv.status === 'paid' ? 'var(--income)' : inv.status === 'refunded' ? 'var(--ink-3)' : 'var(--danger)';
          tr.innerHTML = `<td style="font-weight:650">${inv.number}</td><td>${new Date(inv.createdAt).toLocaleDateString()}</td><td>${L.escape(inv.description)}</td><td class="num">${L.money(inv.amount, 'USD')}</td><td><span class="chip chip--sm" style="color:${statusColor}">${L.titleCase(inv.status)}</span></td>`;
          const td = el('td', {});
          const dl = el('button', { class: 'btn btn--ghost btn--sm', text: 'Receipt' });
          dl.onclick = () => Views._invoiceReceipt(inv);
          td.appendChild(dl); tr.appendChild(td); tb.appendChild(tr);
        });
        histCard.appendChild(t);
      }
      wrap.appendChild(histCard);
      return wrap;
    },

    async _checkout(ctx, planId, cycle) {
      const B = L.Billing;
      const price = B.planPrice(planId, cycle);
      const body = el('div', {});
      body.innerHTML = `
        <div class="card" style="background:var(--surface-2);padding:14px;border-radius:12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div><div style="font-weight:750">${B.PLANS[planId].name} plan</div><div class="hint" style="margin:0">${cycle === 'annual' ? 'Annual billing' : 'Monthly billing'}</div></div>
          <div style="font-size:22px;font-weight:850">${L.money(price, 'USD')}<span style="font-size:12px;color:var(--ink-3)">/${cycle === 'annual' ? 'yr' : 'mo'}</span></div>
        </div>`;
      const nameF = el('input', { class: 'input', placeholder: 'Name on card' });
      const numF = el('input', { class: 'input', placeholder: '4242 4242 4242 4242', inputmode: 'numeric' });
      const expF = el('input', { class: 'input', placeholder: 'MM / YY' });
      const cvcF = el('input', { class: 'input', placeholder: 'CVC', inputmode: 'numeric' });
      body.appendChild(fieldReturn('Name on card', nameF));
      body.appendChild(fieldReturn('Card number', numF));
      const row = el('div', { class: 'grid-2' });
      row.appendChild(fieldReturn('Expiry', expF)); row.appendChild(fieldReturn('CVC', cvcF));
      body.appendChild(row);
      const err = el('div', { class: 'field-err', style: 'display:none' });
      body.appendChild(err);
      body.appendChild(el('div', { class: 'hint', html: '🔒 Demo checkout — use <strong>4242 4242 4242 4242</strong>. No real charge is made. Ready to connect Stripe.', style: 'text-align:center;margin-top:12px' }));

      const foot = el('div', { class: 'modal__foot' });
      const cancel = el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const pay = el('button', { class: 'btn btn--primary', text: `Pay ${L.money(price, 'USD')}` });
      foot.appendChild(cancel); foot.appendChild(pay);
      const { close } = simpleModal(`Upgrade to ${B.PLANS[planId].name}`, body, foot);
      numF.value = '4242 4242 4242 4242'; expF.value = '12 / 30'; cvcF.value = '123';
      cancel.onclick = () => close();
      pay.onclick = async () => {
        err.style.display = 'none'; pay.disabled = true; pay.textContent = 'Processing…';
        try {
          const res = await B.subscribe(S.user.id, { planId, cycle, card: { number: numF.value, exp: expF.value, cvc: cvcF.value } });
          close();
          Views._paymentSuccess(ctx, planId, res.invoice);
        } catch (e) {
          err.textContent = e.message; err.style.display = 'block';
          pay.disabled = false; pay.textContent = `Pay ${L.money(price, 'USD')}`;
        }
      };
    },

    _paymentSuccess(ctx, planId, invoice) {
      const B = L.Billing;
      const body = el('div', { style: 'text-align:center;padding:8px 0' });
      body.innerHTML = `
        <div style="width:64px;height:64px;border-radius:50%;background:var(--income-soft);color:var(--income);font-size:32px;display:grid;place-items:center;margin:6px auto 16px">✓</div>
        <h3 style="margin:0 0 6px;font-size:20px">You're on ${B.PLANS[planId].name}! 🎉</h3>
        <p class="muted" style="margin:0 0 8px">All ${B.PLANS[planId].name} features are unlocked.${invoice ? ' Invoice ' + invoice.number + ' has been added to your billing history.' : ''}</p>`;
      const done = el('button', { class: 'btn btn--primary btn--block', text: 'Done', style: 'margin-top:16px' });
      const { close } = simpleModal('Payment successful', body);
      done.onclick = () => { close(); ctx.rerenderShell && ctx.rerenderShell(); ctx.refresh(); };
      body.appendChild(done);
    },

    async _addCard(ctx) {
      const B = L.Billing;
      const body = el('div', {});
      const numF = el('input', { class: 'input', placeholder: '4242 4242 4242 4242', inputmode: 'numeric' });
      const expF = el('input', { class: 'input', placeholder: 'MM / YY' });
      const cvcF = el('input', { class: 'input', placeholder: 'CVC', inputmode: 'numeric' });
      body.appendChild(fieldReturn('Card number', numF));
      const row = el('div', { class: 'grid-2' }); row.appendChild(fieldReturn('Expiry', expF)); row.appendChild(fieldReturn('CVC', cvcF));
      body.appendChild(row);
      const err = el('div', { class: 'field-err', style: 'display:none' });
      body.appendChild(err);
      const foot = el('div', { class: 'modal__foot' });
      const cancel = el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const save = el('button', { class: 'btn btn--primary', text: 'Add card' });
      foot.appendChild(cancel); foot.appendChild(save);
      const { close } = simpleModal('Add payment method', body, foot);
      cancel.onclick = () => close();
      save.onclick = async () => {
        err.style.display = 'none'; save.disabled = true; save.textContent = 'Saving…';
        try {
          const charge = await B.PaymentProcessor.charge({ number: numF.value, exp: expF.value, cvc: cvcF.value, amount: 0, currency: 'USD' });
          charge.exp = expF.value;
          await B.savePaymentMethod(S.user.id, charge, true);
          close(); L.toast('Card added'); ctx.refresh();
        } catch (e) { err.textContent = e.message; err.style.display = 'block'; save.disabled = false; save.textContent = 'Add card'; }
      };
    },

    _invoiceReceipt(inv) {
      const body = el('div', {});
      body.innerHTML = `
        <div style="text-align:center;margin-bottom:16px"><div class="brand__logo" style="width:40px;height:40px;margin:0 auto 8px">L</div><div style="font-weight:800;font-size:18px">Ledgerly</div><div class="hint">Receipt · ${inv.number}</div></div>
        <div class="tbl-wrap"><table class="tbl">
          <tr><td class="muted">Date</td><td class="num">${new Date(inv.createdAt).toLocaleDateString()}</td></tr>
          <tr><td class="muted">Description</td><td class="num">${L.escape(inv.description)}</td></tr>
          <tr><td class="muted">Billing cycle</td><td class="num">${L.titleCase(inv.cycle || 'monthly')}</td></tr>
          ${inv.card ? `<tr><td class="muted">Paid with</td><td class="num">${inv.card.brand} •••• ${inv.card.last4}</td></tr>` : ''}
          <tr><td class="muted">Status</td><td class="num">${L.titleCase(inv.status)}</td></tr>
          <tr><td style="font-weight:800">Total</td><td class="num" style="font-weight:800;font-size:16px">${L.money(inv.amount, 'USD')}</td></tr>
        </table></div>`;
      const dl = el('button', { class: 'btn btn--primary btn--block', text: '⬇ Download CSV', style: 'margin-top:16px' });
      dl.onclick = () => L.download(`${inv.number}.csv`, L.toCSV([[inv.number, new Date(inv.createdAt).toISOString(), inv.description, inv.amount.toFixed(2), inv.status]], ['Invoice', 'Date', 'Description', 'Amount USD', 'Status']), 'text/csv');
      body.appendChild(dl);
      simpleModal('Invoice ' + inv.number, body);
    },

    /* ================= TEAM ================= */
    async team(ctx) {
      const [members, ent] = await Promise.all([S.members(), S.entitlements()]);
      const wrap = el('div', { class: 'page-enter' });
      const add = el('button', { class: 'btn btn--primary btn--sm', text: '＋ Invite member' });
      add.onclick = () => Views._inviteMember(ctx, members.length, ent);
      const body = el('div', {});
      const seatInfo = el('div', { class: 'hint', style: 'margin-bottom:12px' });
      seatInfo.textContent = `${members.length} of ${ent.limits.seats === Infinity ? '∞' : ent.limits.seats} seats used`;
      body.appendChild(seatInfo);
      members.forEach((m, i) => {
        const row = el('div', { class: 'txn-row', style: 'cursor:default' });
        row.innerHTML = `
          <div class="ava" style="width:42px;height:42px">${L.escape(L.initials(m.name))}</div>
          <div class="txn-main"><div class="txn-vendor">${L.escape(m.name)}</div><div class="txn-meta"><span>${L.escape(m.email)}</span></div></div>
          <div class="row" style="gap:8px"><span class="chip chip--sm">${L.titleCase(m.role)}</span>${m.status === 'invited' ? '<span class="chip chip--sm chip--accent">Invited</span>' : ''}</div>`;
        if (m.role !== 'owner') {
          const rm = el('button', { class: 'iconbtn', html: '🗑', style: 'width:34px;height:34px;margin-left:8px' });
          rm.onclick = async () => { const ok = await M.confirm({ title: 'Remove member?', message: `Remove ${m.name} from this workspace?`, confirmText: 'Remove', danger: true }); if (!ok) return; await S.removeMember(m.id); L.toast('Member removed'); ctx.refresh(); };
          row.appendChild(rm);
        }
        body.appendChild(row);
        if (i < members.length - 1) body.appendChild(el('div', { class: 'list-divider' }));
      });
      wrap.appendChild(card('Team members', S.workspace.name, [body], add));
      return wrap;
    },

    async _inviteMember(ctx, count, ent) {
      const body = el('div', {});
      const nameF = el('input', { class: 'input', placeholder: 'Jane Doe' });
      const emailF = el('input', { class: 'input', type: 'email', placeholder: 'jane@company.com' });
      const roleSel = el('select', { class: 'select' });
      [['admin', 'Admin — manage everything'], ['member', 'Member — add & edit'], ['viewer', 'Viewer — read only']].forEach(([v, t]) => roleSel.appendChild(el('option', { value: v, text: t })));
      body.appendChild(fieldReturn('Name', nameF));
      body.appendChild(fieldReturn('Email', emailF));
      body.appendChild(fieldReturn('Role', roleSel));
      const err = el('div', { class: 'field-err', style: 'display:none' });
      body.appendChild(err);
      const foot = el('div', { class: 'modal__foot' });
      const cancel = el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const save = el('button', { class: 'btn btn--primary', text: 'Send invite' });
      foot.appendChild(cancel); foot.appendChild(save);
      const { close } = simpleModal('Invite team member', body, foot);
      cancel.onclick = () => close();
      save.onclick = async () => {
        err.style.display = 'none';
        try { await S.inviteMember({ name: nameF.value.trim(), email: emailF.value, role: roleSel.value }); close(); L.toast('Invitation sent'); ctx.refresh(); }
        catch (e) { err.textContent = e.message; err.style.display = 'block'; }
      };
    },

    async _importCSV(ctx) {
      const body = el('div', {});
      body.innerHTML = `<p class="muted" style="margin-top:0">Upload a CSV with columns like <code>date, amount, vendor, category, note</code>. We'll map what we can and add them as expenses.</p>`;
      const input = el('input', { type: 'file', accept: '.csv', class: 'input' });
      body.appendChild(input);
      const status = el('div', { class: 'hint' });
      body.appendChild(status);
      const foot = el('div', { class: 'modal__foot' });
      const cancel = el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const doImport = el('button', { class: 'btn btn--primary', text: 'Import' });
      foot.appendChild(cancel); foot.appendChild(doImport);
      const { close } = simpleModal('Import CSV', body, foot);
      cancel.onclick = () => close();
      doImport.onclick = async () => {
        const f = input.files[0]; if (!f) return L.toast('Choose a CSV file', 'error');
        const cats = await S.categories();
        const text = await f.text();
        const rows = L.parseCSV(text);
        if (rows.length < 2) return L.toast('CSV looks empty', 'error');
        const header = rows[0].map((h) => h.toLowerCase().trim());
        const idx = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0);
        const di = idx(['date']); const ai = idx(['amount', 'total']); const vi = idx(['vendor', 'merchant', 'description', 'payee']); const ci = idx(['category']); const ni = idx(['note', 'notes', 'memo']);
        if (ai == null) return L.toast('No amount column found', 'error');
        let n = 0;
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const amt = Math.abs(parseFloat((row[ai] || '').replace(/[^0-9.-]/g, '')));
          if (!(amt > 0)) continue;
          const catName = ci != null ? (row[ci] || '').trim() : '';
          let cat = cats.find((c) => c.name.toLowerCase() === catName.toLowerCase() && c.kind === 'expense') || cats.find((c) => c.name === 'Other Expense' && c.kind === 'expense') || cats.find((c) => c.kind === 'expense');
          let date = L.today();
          if (di != null && row[di]) { const d = new Date(row[di]); if (!isNaN(d)) date = L.dateKey(d); }
          await S.saveTransaction({ type: 'expense', amount: amt, currency: cur(), date, categoryId: cat.id, vendor: vi != null ? (row[vi] || '').trim() : '', note: ni != null ? (row[ni] || '').trim() : '', method: 'Other', deductible: !!cat.deductible });
          n++;
        }
        close(); L.toast(`Imported ${n} transactions`); ctx.refresh();
      };
    },
  };

  /* ---------- shared components ---------- */
  function budgetItem(b, big) {
    const item = el('div', { class: 'budget-item' });
    const pct = L.clamp(b.pct, 0, 1.4);
    const over = b.pct > 1;
    const color = over ? 'var(--danger)' : b.pct > 0.85 ? 'var(--warn)' : 'var(--income)';
    item.innerHTML = `
      <div class="budget-top">
        <span class="budget-name">${b.icon} ${L.escape(b.name)}</span>
        <span class="tabular" style="font-size:${big ? '14px' : '13px'};font-weight:700">${L.money(b.spent, cur())} <span class="muted" style="font-weight:500">/ ${L.money(b.amount, cur())}</span></span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${Math.min(100, pct * 100)}%;background:${color}"></div></div>
      ${over ? `<div class="hint" style="color:var(--danger);margin-top:6px">Over budget by ${L.money(b.spent - b.amount, cur())}</div>` : ''}`;
    return item;
  }
  function legendRow(items) {
    const w = el('div', { class: 'chart-legend' });
    items.forEach(([color, label]) => {
      const s = el('span', {});
      s.innerHTML = `<span class="dotm" style="background:${color}"></span>${label}`;
      w.appendChild(s);
    });
    return w;
  }
  function vendorBreakdown(expenses, currency) {
    const groups = L.groupBy(expenses.filter((t) => t.vendor), (t) => t.vendor);
    const rows = [];
    for (const [v, items] of groups) rows.push({ vendor: v, total: L.sum(items, (t) => S.baseAmount(t)), count: items.length });
    rows.sort((a, b) => b.total - a.total);
    const wrap = el('div', { class: 'tbl-wrap' });
    const body = rows.slice(0, 12).map((r) => `<tr><td>${L.escape(r.vendor)}</td><td class="num">${r.count}</td><td class="num">${L.money(r.total, currency)}</td></tr>`).join('');
    wrap.innerHTML = `<table class="tbl"><thead><tr><th>Vendor</th><th class="num">Transactions</th><th class="num">Total</th></tr></thead><tbody>${body || '<tr><td colspan=3 class=muted style="text-align:center;padding:20px">No vendor data</td></tr>'}</tbody></table>`;
    return wrap;
  }
  function field(label, inputNode) {
    const f = el('div', { class: 'field', style: 'margin:0' });
    f.appendChild(el('label', { text: label }));
    f.appendChild(inputNode);
    return { field: f, input: inputNode };
  }
  function fieldReturn(label, inputNode) {
    const f = el('div', { class: 'field' });
    f.appendChild(el('label', { text: label }));
    f.appendChild(inputNode);
    return f;
  }
  function bannerEl(icon, title, msg, bg, color) {
    const b = el('div', { class: 'card', style: `padding:16px 18px;display:flex;gap:14px;align-items:center;background:${bg};border-color:${color}33` });
    b.innerHTML = `<div style="font-size:26px">${icon}</div><div><div style="font-weight:750;color:${color}">${L.escape(title)}</div><div style="font-size:13.5px;color:var(--ink-2)">${L.escape(msg)}</div></div>`;
    return b;
  }
  function meter(label, used, limit, limitLabel) {
    const pct = limit === Infinity ? Math.min(100, used * 10) : L.clamp((used / limit) * 100, 0, 100);
    const over = limit !== Infinity && used >= limit;
    return `<div class="lbl" style="display:flex;justify-content:space-between"><span>${label}</span><span class="tabular">${used} / ${limitLabel}</span></div>
      <div class="progress" style="margin-top:2px"><div class="progress__bar" style="width:${pct}%;background:${over ? 'var(--warn)' : 'var(--accent)'}"></div></div>`;
  }
  function exportTxnsCSV(txns, catMap, accts) {
    const acctMap = new Map(accts.map((a) => [a.id, a.name]));
    const rows = txns.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
      const c = catMap.get(t.categoryId);
      return [t.date, t.type, (c ? c.name : ''), t.vendor, t.amount.toFixed(2), t.currency, t.method, acctMap.get(t.accountId) || '', (t.tags || []).join(' '), t.deductible ? 'yes' : 'no', t.note];
    });
    L.download(`ledgerly-transactions-${L.today()}.csv`, L.toCSV(rows, ['Date', 'Type', 'Category', 'Vendor', 'Amount', 'Currency', 'Method', 'Account', 'Tags', 'Deductible', 'Note']), 'text/csv');
    L.toast('CSV exported');
  }
  function simpleModal(title, bodyNode, footNode) {
    const overlay = el('div', { class: 'modal-overlay' });
    const m = el('div', { class: 'modal' });
    const head = el('div', { class: 'modal__head' });
    head.appendChild(el('div', { class: 'modal__title', text: title }));
    const x = el('button', { class: 'modal__x', html: '&times;' });
    head.appendChild(x); m.appendChild(head);
    const body = el('div', { class: 'modal__body' }); body.appendChild(bodyNode); m.appendChild(body);
    if (footNode) m.appendChild(footNode);
    overlay.appendChild(m); document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    const close = () => { overlay.classList.remove('is-open'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 220); };
    x.onclick = close;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    return { close, overlay };
  }

  /* ---------- helpers ---------- */
  function prevRange(range) {
    const days = L.daysBetween(range.from, range.to) + 1;
    const to = L.dateKey(new Date(L.parseDate(range.from).getTime() - 86400000));
    const from = L.dateKey(new Date(L.parseDate(to).getTime() - (days - 1) * 86400000));
    return { from, to, label: 'Previous' };
  }
  function pctDelta(cur, prev) { if (!prev) return cur > 0 ? 100 : 0; return ((cur - prev) / prev) * 100; }
  function deltaLabel(pct, invert) {
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '·';
    return `${arrow} ${Math.abs(pct).toFixed(0)}% vs prev`;
  }

  L.Views = Views;
})();
