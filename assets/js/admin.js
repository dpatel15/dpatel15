/* ============================================================
   Ledgerly — admin.js
   Super Admin console: platform metrics, user & subscription
   management, invoices/revenue, plan management, impersonation
   and an audit log. Reuses L.Store / L.Billing / L.Charts.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const S = L.Store, B = L.Billing, Charts = L.Charts, M = L.Modals;
  const el = L.el;
  const root = document.getElementById('admin-root');

  /* theme */
  L.setTheme = function (t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('ledgerly.theme', t); };
  L.setTheme(localStorage.getItem('ledgerly.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  function money(n) { return L.money(n, 'USD'); }
  function hexA(hex, a) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  function planPill(planId) {
    const map = { starter: 'grey', pro: 'purple', business: 'green' };
    const name = (B.PLANS[planId] || {}).name || planId;
    return `<span class="pill pill--${map[planId] || 'grey'}">${name}</span>`;
  }
  function statusPill(sub) {
    if (!sub) return '<span class="pill pill--grey">none</span>';
    const now = Date.now();
    if (sub.status === 'trialing') return now < sub.trialEnd ? '<span class="pill pill--purple">Trialing</span>' : '<span class="pill pill--amber">Trial ended</span>';
    if (sub.status === 'active') return sub.cancelAtPeriodEnd ? '<span class="pill pill--amber">Canceling</span>' : '<span class="pill pill--green">Active</span>';
    if (sub.status === 'past_due') return '<span class="pill pill--red">Past due</span>';
    if (sub.status === 'canceled') return '<span class="pill pill--red">Canceled</span>';
    return `<span class="pill pill--grey">${sub.status}</span>`;
  }

  /* ---------- shared modal ---------- */
  function simpleModal(title, bodyNode, footNode, opts) {
    opts = opts || {};
    const overlay = el('div', { class: 'modal-overlay' });
    const m = el('div', { class: 'modal' + (opts.wide ? ' modal--wide' : '') });
    const head = el('div', { class: 'modal__head' });
    head.appendChild(el('div', { class: 'modal__title', text: title }));
    const x = el('button', { class: 'modal__x', html: '&times;' }); head.appendChild(x); m.appendChild(head);
    const body = el('div', { class: 'modal__body' }); body.appendChild(bodyNode); m.appendChild(body);
    if (footNode) m.appendChild(footNode);
    overlay.appendChild(m); document.body.appendChild(overlay); document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    const close = () => { overlay.classList.remove('is-open'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 220); };
    x.onclick = close; overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    return { close };
  }
  function confirm(opts) {
    return new Promise((resolve) => {
      const body = el('div', {}, [el('p', { class: 'muted', text: opts.message })]);
      const foot = el('div', { class: 'modal__foot' });
      const c = el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const ok = el('button', { class: 'btn btn--primary', text: opts.confirmText || 'Confirm' });
      if (opts.danger) ok.style.background = 'var(--danger)';
      foot.appendChild(c); foot.appendChild(ok);
      const { close } = simpleModal(opts.title || 'Confirm', body, foot);
      c.onclick = () => { close(); resolve(false); };
      ok.onclick = () => { close(); resolve(true); };
    });
  }

  const NAV = [
    { route: 'overview', icon: 'chart', label: 'Overview' },
    { route: 'users', icon: 'users', label: 'Users' },
    { route: 'subscriptions', icon: 'repeat', label: 'Subscriptions' },
    { route: 'invoices', icon: 'receipt', label: 'Revenue' },
    { route: 'plans', icon: 'tag', label: 'Plans' },
    { route: 'audit', icon: 'file', label: 'Audit log' },
  ];

  const admin = {
    route: 'overview',

    async render() {
      const content = L.$('#admin-content');
      L.$$('.nav__item').forEach((n) => n.classList.toggle('is-active', n.dataset.route === this.route));
      content.innerHTML = '<div style="display:grid;place-items:center;padding:80px"><div class="spinner"></div></div>';
      try {
        const node = await this['view_' + this.route]();
        content.innerHTML = ''; content.appendChild(node); window.scrollTo(0, 0);
      } catch (e) { console.error(e); content.innerHTML = '<div class="empty"><div class="empty__ic">' + L.icon('alert', { size: 34 }) + '</div><div>' + L.escape(e.message) + '</div></div>'; }
    },

    nav(route) { this.route = route; L.$('.sidebar') && L.$('.sidebar').classList.remove('is-open'); this.render(); },

    buildShell() {
      root.innerHTML = '';
      const scrim = el('div', { class: 'scrim' });
      scrim.onclick = () => { L.$('.sidebar').classList.remove('is-open'); scrim.classList.remove('is-open'); };
      const sidebar = el('aside', { class: 'sidebar' });
      const brand = el('div', { class: 'brand' });
      brand.innerHTML = `<div class="brand__logo">${L.icon('logoBars',{size:17})}</div><div><div class="brand__name">Ledgerly</div><span class="admin-tag">Admin</span></div>`;
      sidebar.appendChild(brand);
      const nav = el('nav', { class: 'nav', style: 'margin-top:12px' });
      NAV.forEach((it) => {
        const n = el('div', { class: 'nav__item', 'data-route': it.route });
        n.innerHTML = `<span class="ic">${L.icon(it.icon,{size:18})}</span><span>${it.label}</span>`;
        n.onclick = () => this.nav(it.route);
        nav.appendChild(n);
      });
      sidebar.appendChild(nav);
      sidebar.appendChild(el('div', { class: 'nav__spacer' }));
      const appLink = el('a', { class: 'btn btn--ghost btn--block', href: '../app/', html: L.icon('arrowRight',{size:15}) + ' Back to app', style: 'margin:8px 0' });
      sidebar.appendChild(appLink);
      const userCard = el('div', { class: 'user-card' });
      userCard.innerHTML = `<div class="ava">${L.escape(L.initials(S.user.name))}</div><div style="flex:1;min-width:0"><div style="font-weight:650;font-size:13.5px">${L.escape(S.user.name)}</div><div class="ws-switch__meta">Super admin</div></div>`;
      const logout = el('button', { class: 'iconbtn', html: L.icon('logout'), title: 'Log out' });
      logout.onclick = async () => { await S.logout(); location.reload(); };
      userCard.appendChild(logout);
      sidebar.appendChild(userCard);

      const main = el('main', { class: 'main' });
      const topbar = el('div', { class: 'topbar' });
      const ham = el('button', { class: 'iconbtn hamburger', html: L.icon('menu') });
      ham.onclick = () => { sidebar.classList.add('is-open'); scrim.classList.add('is-open'); };
      topbar.appendChild(ham);
      topbar.appendChild(el('div', {}, [el('div', { class: 'topbar__title', text: 'Admin Console' }), el('div', { class: 'topbar__sub', text: 'Platform management & analytics' })]));
      topbar.appendChild(el('div', { class: 'topbar__spacer' }));
      const themeBtn = el('button', { class: 'iconbtn', html: document.documentElement.getAttribute('data-theme') === 'dark' ? L.icon('sun') : L.icon('moon') });
      themeBtn.onclick = () => { const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; L.setTheme(t); themeBtn.innerHTML = t === 'dark' ? L.icon('sun') : L.icon('moon'); };
      topbar.appendChild(themeBtn);
      main.appendChild(topbar);
      main.appendChild(el('div', { class: 'content', id: 'admin-content' }));

      const appEl = el('div', { class: 'app' });
      appEl.appendChild(sidebar); appEl.appendChild(main);
      root.appendChild(scrim); root.appendChild(appEl);
    },

    /* ===================== OVERVIEW ===================== */
    async view_overview() {
      const m = await S.adminMetrics();
      const wrap = el('div', { class: 'page-enter' });
      const stats = el('div', { class: 'stats' });
      const cards = [
        { ic: 'dollar', bg: 'rgba(6,118,71,.10)', fg: 'var(--income)', label: 'MRR', val: money(m.mrr) },
        { ic: 'calendar', bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'ARR', val: money(m.arr) },
        { ic: 'trendingUp', bg: 'rgba(16,117,105,.10)', fg: '#107569', label: 'Net revenue', val: money(m.netRevenue) },
        { ic: 'users', bg: 'rgba(37,99,235,.10)', fg: '#2563EB', label: 'Total users', val: m.totalUsers },
      ];
      cards.forEach((c) => { const s = el('div', { class: 'stat' }); s.innerHTML = `<div class="stat__ic" style="background:${c.bg};color:${c.fg||'var(--accent)'}">${L.icon(c.ic,{size:19})}</div><div class="stat__label">${c.label}</div><div class="stat__value tabular">${c.val}</div>`; stats.appendChild(s); });
      wrap.appendChild(stats);

      const row2 = el('div', { class: 'stats', style: 'margin-top:16px' });
      [
        { ic: 'trendingUp', bg: 'rgba(6,118,71,.10)', fg: 'var(--income)', label: 'Paying customers', val: m.activePaid },
        { ic: 'gift', bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'Active trials', val: m.trialing },
        { ic: 'building', bg: 'rgba(16,117,105,.10)', fg: '#107569', label: 'Workspaces', val: m.totalWorkspaces },
        { ic: 'receipt', bg: 'rgba(180,35,24,.10)', fg: 'var(--expense)', label: 'Refunded', val: money(m.refunded) },
      ].forEach((c) => { const s = el('div', { class: 'stat' }); s.innerHTML = `<div class="stat__ic" style="background:${c.bg};color:${c.fg||'var(--accent)'}">${L.icon(c.ic,{size:19})}</div><div class="stat__label">${c.label}</div><div class="stat__value tabular">${c.val}</div>`; row2.appendChild(s); });
      wrap.appendChild(row2);

      const grid = el('div', { class: 'two-col', style: 'margin-top:16px' });
      // plan distribution donut
      const dist = [
        { label: 'Starter', value: m.planCounts.starter || 0, color: '#94A3B8' },
        { label: 'Pro', value: m.planCounts.pro || 0, color: '#7C3AED' },
        { label: 'Business', value: m.planCounts.business || 0, color: '#16A34A' },
      ].filter((d) => d.value > 0);
      const distCard = card('Plan distribution', 'By effective plan');
      if (dist.length) {
        const holder = el('div', { style: 'display:flex;justify-content:center' });
        holder.appendChild(Charts.donut(dist, { centerTop: String(m.totalUsers), centerBottom: 'users' }));
        distCard.appendChild(holder);
        const legend = el('div', { class: 'legend' });
        dist.forEach((d) => { const i = el('div', { class: 'legend__item' }); i.innerHTML = `<span class="legend__swatch" style="background:${d.color}"></span><span class="legend__name">${d.label}</span><span class="legend__val">${d.value}</span>`; legend.appendChild(i); });
        distCard.appendChild(legend);
      } else { distCard.appendChild(el('div', { class: 'muted', text: 'No subscriptions yet.' })); }
      grid.appendChild(distCard);

      // revenue by month bars
      const revByMonth = monthRevenue(m.invoices);
      const revCard = card('Revenue', 'Last 6 months');
      revCard.appendChild(Charts.bars(revByMonth, { currency: 'USD' }));
      grid.appendChild(revCard);
      wrap.appendChild(grid);

      // recent signups
      const recent = m.users.filter((u) => u.role !== 'superadmin').sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
      const rc = card('Recent signups', null);
      const subMap = new Map(m.subs.map((s) => [s.userId, s]));
      recent.forEach((u) => {
        const r = el('div', { class: 'txn-row', style: 'cursor:pointer' });
        const sub = subMap.get(u.id);
        r.innerHTML = `<div class="ava">${L.escape(L.initials(u.name))}</div><div class="txn-main"><div class="txn-vendor">${L.escape(u.name)}</div><div class="txn-meta">${L.escape(u.email)}</div></div><div>${statusPill(sub)}</div>`;
        r.onclick = () => this.userDetail(u.id);
        rc.appendChild(r);
      });
      if (!recent.length) rc.appendChild(el('div', { class: 'muted', text: 'No users yet.' }));
      wrap.appendChild(el('div', { style: 'margin-top:16px' }, [rc]));
      return wrap;
    },

    /* ===================== USERS ===================== */
    async view_users() {
      const [users, subs, wss] = await Promise.all([S.adminAllUsers(), S.adminAllSubscriptions(), S.adminAllWorkspaces()]);
      const subMap = new Map(subs.map((s) => [s.userId, s]));
      const wsCount = {}; wss.forEach((w) => { wsCount[w.owner] = (wsCount[w.owner] || 0) + 1; });
      const list = users.filter((u) => u.role !== 'superadmin');
      const wrap = el('div', { class: 'page-enter' });

      const bar = el('div', { class: 'filterbar' });
      const search = el('div', { class: 'search-input' });
      search.innerHTML = `<span class="si">${L.icon('search',{size:16})}</span>`;
      const si = el('input', { class: 'input', placeholder: 'Search users by name or email…' });
      search.appendChild(si); bar.appendChild(search);
      wrap.appendChild(bar);

      const c = card(`All users`, `${list.length} accounts`);
      const tblWrap = el('div', { class: 'tbl-wrap' });
      tblWrap.innerHTML = `<table class="tbl"><thead><tr><th>User</th><th>Plan</th><th>Status</th><th class="num">Workspaces</th><th>Joined</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = tblWrap.querySelector('tbody');
      const self = this;
      function draw(filter) {
        tb.innerHTML = '';
        const rows = list.filter((u) => !filter || (u.name + ' ' + u.email).toLowerCase().includes(filter)).sort((a, b) => b.createdAt - a.createdAt);
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No users</td></tr>'; return; }
        rows.forEach((u) => {
          const sub = subMap.get(u.id);
          const eff = B.effectivePlanId(sub);
          const tr = el('tr', {});
          tr.innerHTML = `<td><div class="row" style="gap:10px"><div class="ava">${L.escape(L.initials(u.name))}</div><div><div style="font-weight:650">${L.escape(u.name)}${u.suspended ? ' <span class="pill pill--red">Suspended</span>' : ''}</div><div class="hint" style="margin:0">${L.escape(u.email)}</div></div></div></td>
            <td>${planPill(eff)}</td><td>${statusPill(sub)}</td><td class="num">${wsCount[u.id] || 0}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td>`;
          const td = el('td', {});
          const manage = el('button', { class: 'btn btn--ghost btn--sm', text: 'Manage' });
          manage.onclick = () => self.userDetail(u.id);
          td.appendChild(manage); tr.appendChild(td); tb.appendChild(tr);
        });
      }
      si.oninput = L.debounce(() => draw(si.value.toLowerCase().trim()), 150);
      draw('');
      c.appendChild(tblWrap);
      wrap.appendChild(c);
      return wrap;
    },

    async userDetail(userId) {
      const [users, subs, wss, invoices] = await Promise.all([S.adminAllUsers(), S.adminAllSubscriptions(), S.adminAllWorkspaces(), S.adminAllInvoices()]);
      const u = users.find((x) => x.id === userId);
      const sub = subs.find((s) => s.userId === userId);
      const uInvoices = invoices.filter((i) => i.userId === userId);
      const uWss = wss.filter((w) => w.owner === userId);
      const eff = B.effectivePlanId(sub);
      const revenue = L.sum(uInvoices.filter((i) => i.status === 'paid'), (i) => i.amount);
      const self = this;

      const body = el('div', {});
      body.innerHTML = `
        <div class="row" style="gap:12px;margin-bottom:16px"><div class="ava" style="width:48px;height:48px;font-size:16px">${L.escape(L.initials(u.name))}</div>
          <div><div style="font-weight:750;font-size:16px">${L.escape(u.name)}</div><div class="hint" style="margin:0">${L.escape(u.email)}</div></div></div>
        <div class="kv"><span>Plan</span><span>${planPill(eff)} ${sub && sub.comp ? '<span class="pill pill--purple">comp</span>' : ''}</span></div>
        <div class="kv"><span>Status</span><span>${statusPill(sub)}</span></div>
        <div class="kv"><span>Billing cycle</span><span>${sub ? L.titleCase(sub.billingCycle) : '—'}</span></div>
        <div class="kv"><span>Renews / ends</span><span>${sub ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}</span></div>
        <div class="kv"><span>Workspaces</span><span>${uWss.length}</span></div>
        <div class="kv"><span>Lifetime revenue</span><span>${money(revenue)}</span></div>
        <div class="kv"><span>Joined</span><span>${new Date(u.createdAt).toLocaleDateString()}</span></div>`;

      // plan change
      const planRow = el('div', { class: 'field', style: 'margin-top:18px' });
      planRow.innerHTML = '<label>Set plan (comp / grant)</label>';
      const psel = el('select', { class: 'select' });
      B.PLAN_ORDER.forEach((pid) => { const o = el('option', { value: pid, text: B.PLANS[pid].name }); if (pid === eff) o.selected = true; psel.appendChild(o); });
      planRow.appendChild(psel);
      body.appendChild(planRow);

      const foot = el('div', { class: 'modal__foot', style: 'flex-wrap:wrap' });
      const imp = el('button', { class: 'btn btn--ghost btn--sm', html: L.icon('eye',{size:15}) + ' Impersonate', style: 'margin-right:auto' });
      const trial = el('button', { class: 'btn btn--ghost btn--sm', text: '+7d trial' });
      const suspend = el('button', { class: 'btn btn--ghost btn--sm', text: u.suspended ? 'Unsuspend' : 'Suspend' });
      const del = el('button', { class: 'btn btn--danger btn--sm', text: 'Delete' });
      const apply = el('button', { class: 'btn btn--primary btn--sm', text: 'Apply plan' });
      foot.appendChild(imp); foot.appendChild(trial); foot.appendChild(suspend); foot.appendChild(del); foot.appendChild(apply);
      const { close } = simpleModal('Manage user', body, foot);

      apply.onclick = async () => { await B.adminSetPlan(userId, psel.value, { comp: psel.value !== 'starter' }); await S.adminLog('set_plan', u.email + ' → ' + psel.value); close(); L.toast('Plan updated'); self.render(); };
      trial.onclick = async () => { await B.adminExtendTrial(userId, 7); await S.adminLog('extend_trial', u.email + ' +7d'); close(); L.toast('Trial extended 7 days'); self.render(); };
      suspend.onclick = async () => { await S.adminSuspendUser(userId, !u.suspended); close(); L.toast(u.suspended ? 'User unsuspended' : 'User suspended'); self.render(); };
      imp.onclick = async () => {
        if (!uWss.length) return L.toast('User has no workspace', 'error');
        await S.impersonate(userId); location.href = '../app/';
      };
      del.onclick = async () => {
        const ok = await confirm({ title: 'Delete user?', message: `Permanently delete ${u.email} and all their data? This cannot be undone.`, confirmText: 'Delete user', danger: true });
        if (!ok) return; await S.adminDeleteUser(userId); close(); L.toast('User deleted'); self.render();
      };
    },

    /* ===================== SUBSCRIPTIONS ===================== */
    async view_subscriptions() {
      const [subs, users] = await Promise.all([S.adminAllSubscriptions(), S.adminAllUsers()]);
      const uMap = new Map(users.map((u) => [u.id, u]));
      const wrap = el('div', { class: 'page-enter' });
      const c = card('Subscriptions', `${subs.length} total`);
      const t = el('div', { class: 'tbl-wrap' });
      t.innerHTML = `<table class="tbl"><thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Cycle</th><th class="num">MRR</th><th>Renews</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = t.querySelector('tbody');
      const self = this;
      subs.filter((s) => { const u = uMap.get(s.userId); return u && u.role !== 'superadmin'; })
        .sort((a, b) => B.monthlyEquivalent(b.planId, b.billingCycle) - B.monthlyEquivalent(a.planId, a.billingCycle))
        .forEach((s) => {
          const u = uMap.get(s.userId); if (!u) return;
          const eff = B.effectivePlanId(s);
          const mrr = (s.status === 'active' && !s.comp && eff !== 'starter') ? B.monthlyEquivalent(s.planId, s.billingCycle) : 0;
          const tr = el('tr', {});
          tr.innerHTML = `<td><div style="font-weight:650">${L.escape(u.name)}</div><div class="hint" style="margin:0">${L.escape(u.email)}</div></td>
            <td>${planPill(eff)}</td><td>${statusPill(s)}</td><td>${L.titleCase(s.billingCycle)}</td><td class="num">${money(mrr)}</td><td>${new Date(s.currentPeriodEnd).toLocaleDateString()}</td>`;
          const td = el('td', {});
          const manage = el('button', { class: 'btn btn--ghost btn--sm', text: 'Manage' });
          manage.onclick = () => self.userDetail(s.userId);
          td.appendChild(manage); tr.appendChild(td); tb.appendChild(tr);
        });
      c.appendChild(t); wrap.appendChild(c);
      return wrap;
    },

    /* ===================== INVOICES / REVENUE ===================== */
    async view_invoices() {
      const [invoices, users] = await Promise.all([S.adminAllInvoices(), S.adminAllUsers()]);
      const uMap = new Map(users.map((u) => [u.id, u]));
      invoices.sort((a, b) => b.createdAt - a.createdAt);
      const revenue = L.sum(invoices.filter((i) => i.status === 'paid'), (i) => i.amount);
      const refunded = L.sum(invoices.filter((i) => i.status === 'refunded'), (i) => i.amount);
      const wrap = el('div', { class: 'page-enter' });

      const stats = el('div', { class: 'stats' });
      [
        { ic: 'dollar', bg: 'rgba(6,118,71,.10)', fg: 'var(--income)', label: 'Gross revenue', val: money(revenue) },
        { ic: 'receipt', bg: 'rgba(180,35,24,.10)', fg: 'var(--expense)', label: 'Refunded', val: money(refunded) },
        { ic: 'chart', bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'Net revenue', val: money(revenue - refunded) },
        { ic: 'receipt', bg: 'rgba(16,117,105,.10)', fg: '#107569', label: 'Invoices', val: invoices.length },
      ].forEach((c) => { const s = el('div', { class: 'stat' }); s.innerHTML = `<div class="stat__ic" style="background:${c.bg};color:${c.fg||'var(--accent)'}">${L.icon(c.ic,{size:19})}</div><div class="stat__label">${c.label}</div><div class="stat__value tabular">${c.val}</div>`; stats.appendChild(s); });
      wrap.appendChild(stats);

      const exportBtn = el('button', { class: 'btn btn--ghost btn--sm', html: L.icon('download',{size:15}) + ' Export CSV' });
      exportBtn.onclick = () => {
        const rows = invoices.map((i) => { const u = uMap.get(i.userId); return [i.number, new Date(i.createdAt).toISOString(), u ? u.email : '', i.description, i.amount.toFixed(2), i.status]; });
        L.download('ledgerly-invoices.csv', L.toCSV(rows, ['Invoice', 'Date', 'Customer', 'Description', 'Amount USD', 'Status']), 'text/csv');
      };
      const c = card('All invoices', null, exportBtn);
      const t = el('div', { class: 'tbl-wrap' });
      t.innerHTML = `<table class="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Description</th><th class="num">Amount</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = t.querySelector('tbody');
      const self = this;
      if (!invoices.length) tb.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">No invoices yet</td></tr>';
      invoices.forEach((i) => {
        const u = uMap.get(i.userId);
        const sc = i.status === 'paid' ? 'green' : i.status === 'refunded' ? 'grey' : 'red';
        const tr = el('tr', {});
        tr.innerHTML = `<td style="font-weight:650">${i.number}</td><td>${u ? L.escape(u.email) : '—'}</td><td>${L.escape(i.description)}</td><td class="num">${money(i.amount)}</td><td><span class="pill pill--${sc}">${L.titleCase(i.status)}</span></td><td>${new Date(i.createdAt).toLocaleDateString()}</td>`;
        const td = el('td', {});
        if (i.status === 'paid') {
          const refund = el('button', { class: 'btn btn--danger btn--sm', text: 'Refund' });
          refund.onclick = async () => { const ok = await confirm({ title: 'Refund invoice?', message: `Refund ${money(i.amount)} for ${i.number}?`, confirmText: 'Refund', danger: true }); if (!ok) return; await B.adminRefundInvoice(i.id); await S.adminLog('refund', i.number); L.toast('Invoice refunded'); self.render(); };
          td.appendChild(refund);
        }
        tr.appendChild(td); tb.appendChild(tr);
      });
      c.appendChild(t); wrap.appendChild(c);
      return wrap;
    },

    /* ===================== PLANS ===================== */
    async view_plans() {
      const wrap = el('div', { class: 'page-enter' });
      wrap.appendChild(el('p', { class: 'muted', text: 'Edit plan pricing and limits. Changes apply across the whole platform immediately.', style: 'margin-top:0' }));
      const grid = el('div', { class: 'plan-grid' });
      const self = this;
      B.PLAN_ORDER.forEach((pid) => {
        const p = B.PLANS[pid];
        const c = el('div', { class: 'card card--pad' });
        c.innerHTML = `<div style="font-weight:800;font-size:18px;color:${p.color}">${p.name}</div><div class="hint" style="margin:0 0 12px">${p.tagline}</div>`;
        const mF = fieldNum('Monthly ($)', p.priceMonthly);
        const aF = fieldNum('Annual ($)', p.priceAnnual);
        const wF = fieldNum('Workspaces', p.limits.workspaces === Infinity ? 999 : p.limits.workspaces);
        const sF = fieldNum('Seats', p.limits.seats === Infinity ? 999 : p.limits.seats);
        c.appendChild(el('div', { class: 'grid-2' }, [mF.field, aF.field]));
        c.appendChild(el('div', { class: 'grid-2' }, [wF.field, sF.field]));
        // features
        const featWrap = el('div', { style: 'margin-top:8px' });
        featWrap.appendChild(el('div', { class: 'lbl', text: 'Features' }));
        const checks = {};
        B.ALL_FEATURES.forEach((f) => {
          const rowL = el('label', { class: 'row', style: 'gap:8px;padding:3px 0;font-size:13px;cursor:pointer' });
          const cb = el('input', { type: 'checkbox' }); if (p.features.indexOf(f) >= 0) cb.checked = true;
          checks[f] = cb;
          rowL.appendChild(cb); rowL.appendChild(el('span', { text: B.FEATURE_LABELS[f] }));
          featWrap.appendChild(rowL);
        });
        c.appendChild(featWrap);
        const save = el('button', { class: 'btn btn--primary btn--sm btn--block', text: 'Save ' + p.name, style: 'margin-top:12px' });
        save.onclick = async () => {
          const cfg = { priceMonthly: +mF.input.value || 0, priceAnnual: +aF.input.value || 0, limits: { workspaces: +wF.input.value >= 999 ? Infinity : +wF.input.value, seats: +sF.input.value >= 999 ? Infinity : +sF.input.value }, features: B.ALL_FEATURES.filter((f) => checks[f].checked) };
          await savePlanConfig(pid, cfg);
          await S.adminLog('edit_plan', pid);
          L.toast(p.name + ' plan saved'); self.render();
        };
        c.appendChild(save);
        grid.appendChild(c);
      });
      wrap.appendChild(grid);
      return wrap;
    },

    /* ===================== AUDIT LOG ===================== */
    async view_audit() {
      const logs = await S.adminAllLogs();
      const wrap = el('div', { class: 'page-enter' });
      const c = card('Audit log', `${logs.length} events`);
      if (!logs.length) c.appendChild(el('div', { class: 'muted', text: 'No admin actions recorded yet.' }));
      const t = el('div', { class: 'tbl-wrap' });
      t.innerHTML = `<table class="tbl"><thead><tr><th>When</th><th>Action</th><th>Detail</th><th>Actor</th></tr></thead><tbody></tbody></table>`;
      const tb = t.querySelector('tbody');
      logs.forEach((l) => { const tr = el('tr', {}); tr.innerHTML = `<td>${new Date(l.at).toLocaleString()}</td><td><span class="pill pill--purple">${L.escape(l.action)}</span></td><td>${L.escape(l.detail)}</td><td>${L.escape(l.actor)}</td>`; tb.appendChild(tr); });
      if (logs.length) c.appendChild(t);
      wrap.appendChild(c);
      return wrap;
    },

    async start() {
      this.buildShell();
      await this.render();
    },
  };

  /* ---------- helpers ---------- */
  function card(title, sub, headExtra) {
    const c = el('div', { class: 'card card--pad' });
    if (title) { const h = el('div', { class: 'card__head' }); h.appendChild(el('div', {}, [el('div', { class: 'card__title', text: title }), sub ? el('div', { class: 'card__sub', text: sub }) : null])); if (headExtra) h.appendChild(headExtra); c.appendChild(h); }
    return c;
  }
  function fieldNum(label, val) {
    const f = el('div', { class: 'field', style: 'margin:0' });
    f.appendChild(el('label', { text: label }));
    const i = el('input', { class: 'input', type: 'number', value: val });
    f.appendChild(i);
    return { field: f, input: i };
  }
  function monthRevenue(invoices) {
    const now = new Date(); const keys = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(L.dateKey(d).slice(0, 7)); }
    const map = new Map(keys.map((k) => [k, { month: k, income: 0, expense: 0 }]));
    invoices.forEach((inv) => { if (inv.status !== 'paid') return; const mk = new Date(inv.createdAt); const key = L.dateKey(mk).slice(0, 7); if (map.has(key)) map.get(key).income += inv.amount; });
    return Array.from(map.values());
  }
  async function savePlanConfig(planId, cfg) {
    const meta = (await L.DB.get('meta', 'planConfig')) || { key: 'planConfig', plans: {} };
    meta.plans[planId] = cfg;
    await L.DB.put('meta', meta);
    applyPlanConfig(meta);
  }
  function applyPlanConfig(meta) {
    if (!meta || !meta.plans) return;
    for (const pid in meta.plans) {
      const cfg = meta.plans[pid]; const p = B.PLANS[pid]; if (!p) continue;
      if (cfg.priceMonthly != null) p.priceMonthly = cfg.priceMonthly;
      if (cfg.priceAnnual != null) p.priceAnnual = cfg.priceAnnual;
      if (cfg.limits) p.limits = cfg.limits;
      if (cfg.features) p.features = cfg.features;
    }
  }

  /* ============================================================
     AUTH GATE
     ============================================================ */
  function renderLogin(msg) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'admin-login' });
    const box = el('div', { class: 'admin-login__box' });
    box.innerHTML = `<div class="brand" style="padding:0 0 10px"><div class="brand__logo">${L.icon('logoBars',{size:17})}</div><div class="brand__name">Ledgerly <span class="admin-tag">Admin</span></div></div>
      <h2>Super admin</h2><p class="muted" style="margin-top:4px">Sign in to the platform console.</p>
      <div class="cred-hint">Demo admin — email <code>admin@ledgerly.app</code>, password <code>admin1234</code></div>`;
    const form = el('form', { class: 'stack' });
    const email = el('input', { class: 'input', type: 'email', placeholder: 'admin@ledgerly.app', value: 'admin@ledgerly.app' });
    const pass = el('input', { class: 'input', type: 'password', placeholder: 'Password' });
    form.appendChild(el('div', { class: 'field', style: 'margin:0' }, [el('label', { text: 'Email' }), email]));
    form.appendChild(el('div', { class: 'field', style: 'margin:0' }, [el('label', { text: 'Password' }), pass]));
    const err = el('div', { class: 'field-err', style: msg ? '' : 'display:none' }); err.textContent = msg || '';
    form.appendChild(err);
    const submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', text: 'Enter console' });
    form.appendChild(submit);
    box.appendChild(form); wrap.appendChild(box); root.appendChild(wrap);
    setTimeout(() => pass.focus(), 50);
    form.onsubmit = async (e) => {
      e.preventDefault(); err.style.display = 'none'; submit.disabled = true; submit.textContent = 'Signing in…';
      try {
        await S.login({ email: email.value, password: pass.value });
        if (!S.isSuper()) { await S.logout(); throw new Error('That account is not a super admin.'); }
        admin.start();
      } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; submit.disabled = false; submit.textContent = 'Enter console'; }
    };
  }

  /* ---------- boot ---------- */
  (async function boot() {
    try {
      await S.ensureSuperAdmin();
      // apply any saved plan config overrides
      const meta = await L.DB.get('meta', 'planConfig'); applyPlanConfig(meta);
      const ok = await S.restore();
      if (ok && S.isSuper()) admin.start();
      else { if (ok && !S.isSuper()) await S.logout(); renderLogin(); }
    } catch (e) { console.error(e); renderLogin(e.message); }
    const splash = document.getElementById('splash'); if (splash) splash.remove();
  })();

  window.L.admin = admin;
})();
