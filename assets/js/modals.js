/* ============================================================
   Ledgerly — modals.js
   All modal dialogs: transaction editor, category/account/
   budget/recurring editors, confirm, and receipt viewer.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const S = L.Store;

  const ICONS = ['tag','briefcase','monitor','plane','utensils','coffee','megaphone','building','users','scale','shield','fuel','landmark','bank','card','wallet','receipt','box','dollar','handshake','plusCircle','trendingUp','percent','globe','zap','settings','camera','edit','file','target','calendar','user'];
  const COLORS = ['#2563EB','#4F46E5','#6938EF','#7A5AF8','#0E7090','#107569','#067647','#12B76A','#B54708','#C4320A','#B42318','#C11574','#344054','#475467','#667085','#0BA5EC'];

  /* ---------- Core modal plumbing ---------- */
  function open(node) {
    const overlay = L.el('div', { class: 'modal-overlay' });
    overlay.appendChild(node);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    const close = () => {
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(() => overlay.remove(), 220);
    };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    return { overlay, close };
  }

  function shell(title, bodyNode, footNode, opts) {
    opts = opts || {};
    const m = L.el('div', { class: 'modal' + (opts.wide ? ' modal--wide' : '') });
    const head = L.el('div', { class: 'modal__head' });
    head.appendChild(L.el('div', { class: 'modal__title', text: title }));
    const x = L.el('button', { class: 'modal__x', html: '&times;', 'aria-label': 'Close' });
    head.appendChild(x);
    m.appendChild(head);
    const body = L.el('div', { class: 'modal__body' });
    body.appendChild(bodyNode);
    m.appendChild(body);
    if (footNode) m.appendChild(footNode);
    return { m, x };
  }

  const Modals = {
    confirm({ title, message, confirmText, danger }) {
      return new Promise((resolve) => {
        const body = L.el('div', {}, [L.el('p', { text: message, class: 'muted' })]);
        const foot = L.el('div', { class: 'modal__foot' });
        const cancel = L.el('button', { class: 'btn btn--ghost', text: 'Cancel' });
        const ok = L.el('button', { class: 'btn ' + (danger ? 'btn--primary' : 'btn--primary'), text: confirmText || 'Confirm' });
        if (danger) { ok.style.background = 'var(--danger)'; }
        foot.appendChild(cancel); foot.appendChild(ok);
        const { m, x } = shell(title || 'Are you sure?', body, foot);
        const { close } = open(m);
        x.onclick = () => { close(); resolve(false); };
        cancel.onclick = () => { close(); resolve(false); };
        ok.onclick = () => { close(); resolve(true); };
      });
    },

    /* ---------- Transaction editor ---------- */
    async transaction(existing, onSaved) {
      const [cats, accts, ent] = await Promise.all([S.categories(), S.accounts(), S.entitlements()]);
      cats.sort((a, b) => (a.order || 0) - (b.order || 0));
      const t = Object.assign({
        type: 'expense', amount: '', currency: S.workspace.currency, date: L.today(),
        categoryId: null, accountId: accts[0] ? accts[0].id : null, vendor: '', method: 'Card',
        note: '', tags: [], deductible: false, receiptId: null,
      }, existing || {});
      let receiptDataUrl = null;
      if (t.receiptId) { const r = await S.getReceipt(t.receiptId); receiptDataUrl = r ? r.dataUrl : null; }

      const catsForType = () => cats.filter((c) => c.kind === t.type);

      const body = L.el('div', {});
      // Type segmented
      const seg = L.el('div', { class: 'segment', style: 'display:flex;width:100%;margin-bottom:18px' });
      const segExp = L.el('button', { text: 'Expense', class: t.type === 'expense' ? 'is-active' : '', style: 'flex:1' });
      const segInc = L.el('button', { text: 'Income', class: t.type === 'income' ? 'is-active' : '', style: 'flex:1' });
      seg.appendChild(segExp); seg.appendChild(segInc);
      body.appendChild(seg);

      // Amount + currency
      const amtField = L.el('div', { class: 'field' });
      amtField.innerHTML = `<label>Amount</label>`;
      const amtRow = L.el('div', { class: 'row', style: 'gap:10px' });
      const amtGroup = L.el('div', { class: 'input-group', style: 'flex:1' });
      const sym = L.el('span', { class: 'prefix', text: (L.CURRENCIES[t.currency] || {}).symbol || '$' });
      const amtInput = L.el('input', { class: 'input', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0.00', value: t.amount, style: 'font-size:20px;font-weight:700' });
      amtGroup.appendChild(sym); amtGroup.appendChild(amtInput);
      const curSel = L.el('select', { class: 'select', style: 'width:120px' });
      Object.values(L.CURRENCIES).forEach((c) => {
        const o = L.el('option', { value: c.code, text: `${c.code}` }); if (c.code === t.currency) o.selected = true; curSel.appendChild(o);
      });
      curSel.onchange = () => { sym.textContent = (L.CURRENCIES[curSel.value] || {}).symbol || '$'; };
      if (!ent.can('multiCurrency')) { curSel.value = S.workspace.currency; curSel.disabled = true; curSel.title = 'Multi-currency is a Pro feature'; sym.textContent = (L.CURRENCIES[S.workspace.currency] || {}).symbol || '$'; }
      amtRow.appendChild(amtGroup); amtRow.appendChild(curSel);
      amtField.appendChild(amtRow);
      body.appendChild(amtField);

      // Category picker
      const catField = L.el('div', { class: 'field' });
      catField.innerHTML = `<label>Category</label>`;
      const catWrap = L.el('div', { class: 'cat-picker' });
      catField.appendChild(catWrap);
      body.appendChild(catField);
      function renderCats() {
        catWrap.innerHTML = '';
        catsForType().forEach((c) => {
          const opt = L.el('div', { class: 'cat-opt' + (c.id === t.categoryId ? ' is-sel' : '') });
          opt.innerHTML = `<div class="cat-opt__ic">${L.catGlyph(c.icon,20)}</div><div class="cat-opt__name">${L.escape(c.name)}</div>`;
          opt.onclick = () => { t.categoryId = c.id; t.deductible = !!c.deductible; renderCats(); };
          catWrap.appendChild(opt);
        });
      }
      renderCats();

      // Vendor + Date
      const row1 = L.el('div', { class: 'grid-2' });
      const vendorField = L.el('div', { class: 'field', style: 'margin:0' });
      vendorField.innerHTML = `<label>${t.type === 'income' ? 'Source / Client' : 'Vendor / Merchant'}</label>`;
      const vendorInput = L.el('input', { class: 'input', placeholder: t.type === 'income' ? 'e.g. Acme Corp' : 'e.g. Amazon', value: t.vendor, list: 'vendorList' });
      vendorField.appendChild(vendorInput);
      const dateField = L.el('div', { class: 'field', style: 'margin:0' });
      dateField.innerHTML = `<label>Date</label>`;
      const dateInput = L.el('input', { class: 'input', type: 'date', value: t.date });
      dateField.appendChild(dateInput);
      row1.appendChild(vendorField); row1.appendChild(dateField);
      body.appendChild(row1);
      // vendor datalist
      S.vendors().then((vs) => {
        const dl = L.el('datalist', { id: 'vendorList' });
        vs.forEach((v) => dl.appendChild(L.el('option', { value: v.name })));
        body.appendChild(dl);
      });

      // Account + Method
      const row2 = L.el('div', { class: 'grid-2' });
      const acctField = L.el('div', { class: 'field', style: 'margin:0' });
      acctField.innerHTML = `<label>Account</label>`;
      const acctSel = L.el('select', { class: 'select' });
      accts.forEach((a) => { const o = L.el('option', { value: a.id, text: a.name }); if (a.id === t.accountId) o.selected = true; acctSel.appendChild(o); });
      acctField.appendChild(acctSel);
      const methodField = L.el('div', { class: 'field', style: 'margin:0' });
      methodField.innerHTML = `<label>Payment method</label>`;
      const methodSel = L.el('select', { class: 'select' });
      S.PAYMENT_METHODS.forEach((mth) => { const o = L.el('option', { value: mth, text: mth }); if (mth === t.method) o.selected = true; methodSel.appendChild(o); });
      methodField.appendChild(methodSel);
      row2.appendChild(acctField); row2.appendChild(methodField);
      body.appendChild(row2);

      // Note + tags
      const noteField = L.el('div', { class: 'field' });
      noteField.innerHTML = `<label>Notes</label>`;
      const noteInput = L.el('textarea', { class: 'input', placeholder: 'Add a note, reference, or memo…', style: 'min-height:60px' });
      noteInput.value = t.note || '';
      noteField.appendChild(noteInput);
      body.appendChild(noteField);

      const tagsField = L.el('div', { class: 'field' });
      tagsField.innerHTML = `<label>Tags <span class="muted" style="font-weight:500">(comma separated)</span></label>`;
      const tagsInput = L.el('input', { class: 'input', placeholder: 'client, reimbursable, q3', value: (t.tags || []).join(', ') });
      tagsField.appendChild(tagsInput);
      body.appendChild(tagsField);

      // Deductible toggle
      const dedRow = L.el('label', { class: 'row', style: 'justify-content:space-between;padding:12px;border:1px solid var(--line-2);border-radius:12px;cursor:pointer' });
      dedRow.innerHTML = `<div><div style="font-weight:650;font-size:14px">Tax deductible</div><div class="hint" style="margin:0">Include this in tax & deductible reports</div></div>`;
      const dedToggle = L.el('span', { class: 'toggle' });
      const dedCheck = L.el('input', { type: 'checkbox' }); if (t.deductible) dedCheck.checked = true;
      dedToggle.appendChild(dedCheck); dedToggle.appendChild(L.el('span', { class: 'track' })); dedToggle.appendChild(L.el('span', { class: 'knob' }));
      dedRow.appendChild(dedToggle);
      body.appendChild(dedRow);

      // Receipt
      const rcptField = L.el('div', { class: 'field', style: 'margin-top:16px' });
      rcptField.innerHTML = `<label>Receipt</label>`;
      const rcptHolder = L.el('div', {});
      rcptField.appendChild(rcptHolder);
      body.appendChild(rcptField);
      const fileInput = L.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      function renderReceipt() {
        rcptHolder.innerHTML = '';
        if (receiptDataUrl) {
          const thumb = L.el('div', { class: 'receipt-thumb' });
          thumb.appendChild(L.el('img', { src: receiptDataUrl, alt: 'Receipt' }));
          const rm = L.el('button', { class: 'rm', html: '&times;', title: 'Remove' });
          rm.onclick = () => { receiptDataUrl = null; t.receiptId = null; renderReceipt(); };
          thumb.appendChild(rm);
          rcptHolder.appendChild(thumb);
        } else {
          const drop = L.el('div', { class: 'drop' });
          drop.innerHTML = `<div style="color:var(--ink-3);display:flex;justify-content:center;margin-bottom:4px">${L.icon('camera',{size:26})}</div><div style="font-weight:600;margin-top:6px">Tap to add a receipt photo</div><div class="hint" style="margin-top:2px">JPG or PNG, stored privately on your device</div>`;
          drop.onclick = () => fileInput.click();
          drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('is-drag'); };
          drop.ondragleave = () => drop.classList.remove('is-drag');
          drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('is-drag'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
          rcptHolder.appendChild(drop);
        }
      }
      function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return L.toast('Please choose an image file', 'error');
        const reader = new FileReader();
        reader.onload = () => {
          // downscale to keep storage sane
          const img = new Image();
          img.onload = () => {
            const max = 1400; let { width, height } = img;
            if (width > max || height > max) { const s = max / Math.max(width, height); width *= s; height *= s; }
            const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
            cv.getContext('2d').drawImage(img, 0, 0, width, height);
            receiptDataUrl = cv.toDataURL('image/jpeg', 0.82);
            renderReceipt();
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      }
      fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };
      body.appendChild(fileInput);
      renderReceipt();

      // type switching
      function setType(type) {
        t.type = type;
        segExp.classList.toggle('is-active', type === 'expense');
        segInc.classList.toggle('is-active', type === 'income');
        const list = catsForType();
        if (!list.find((c) => c.id === t.categoryId)) t.categoryId = list[0] ? list[0].id : null;
        vendorField.querySelector('label').textContent = type === 'income' ? 'Source / Client' : 'Vendor / Merchant';
        renderCats();
      }
      segExp.onclick = () => setType('expense');
      segInc.onclick = () => setType('income');
      if (!t.categoryId) setType(t.type);

      // Footer
      const foot = L.el('div', { class: 'modal__foot' });
      let delBtn = null;
      if (existing && existing.id) {
        delBtn = L.el('button', { class: 'btn btn--danger', text: 'Delete', style: 'margin-right:auto' });
      }
      const cancel = L.el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const save = L.el('button', { class: 'btn btn--primary', text: existing && existing.id ? 'Save changes' : 'Add transaction' });
      if (delBtn) foot.appendChild(delBtn);
      foot.appendChild(cancel); foot.appendChild(save);

      const { m, x } = shell(existing && existing.id ? 'Edit transaction' : 'New transaction', body, foot);
      const { close } = open(m);
      setTimeout(() => amtInput.focus(), 60);
      x.onclick = cancel.onclick = () => close();
      if (delBtn) delBtn.onclick = async () => {
        const ok = await Modals.confirm({ title: 'Delete transaction?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true });
        if (!ok) return;
        await S.deleteTransaction(existing.id);
        close(); L.toast('Transaction deleted'); onSaved && onSaved();
      };
      save.onclick = async () => {
        const amount = parseFloat(amtInput.value);
        if (!(amount > 0)) { amtInput.focus(); amtInput.style.borderColor = 'var(--danger)'; return L.toast('Enter an amount greater than 0', 'error'); }
        if (!t.categoryId) return L.toast('Pick a category', 'error');
        save.disabled = true; save.textContent = 'Saving…';
        if (receiptDataUrl && !t.receiptId) t.receiptId = await S.saveReceipt(receiptDataUrl);
        const rec = {
          id: existing && existing.id ? existing.id : undefined,
          type: t.type, amount, currency: curSel.value, date: dateInput.value || L.today(),
          categoryId: t.categoryId, accountId: acctSel.value, vendor: vendorInput.value.trim(),
          method: methodSel.value, note: noteInput.value.trim(),
          tags: tagsInput.value.split(',').map((s) => s.trim()).filter(Boolean),
          deductible: dedCheck.checked, receiptId: t.receiptId,
          createdAt: existing && existing.createdAt ? existing.createdAt : Date.now(),
        };
        await S.saveTransaction(rec);
        close(); L.toast(existing && existing.id ? 'Transaction updated' : 'Transaction added');
        onSaved && onSaved();
      };
    },

    /* ---------- Category editor ---------- */
    async category(existing, onSaved) {
      const c = Object.assign({ name: '', icon: 'tag', color: '#2563EB', kind: 'expense', deductible: false }, existing || {});
      const body = L.el('div', {});
      const nameField = L.el('div', { class: 'field' });
      nameField.innerHTML = `<label>Category name</label>`;
      const nameInput = L.el('input', { class: 'input', placeholder: 'e.g. Subscriptions', value: c.name });
      nameField.appendChild(nameInput); body.appendChild(nameField);

      const kindField = L.el('div', { class: 'field' });
      kindField.innerHTML = `<label>Type</label>`;
      const seg = L.el('div', { class: 'segment', style: 'width:100%' });
      const be = L.el('button', { text: 'Expense', style: 'flex:1', class: c.kind === 'expense' ? 'is-active' : '' });
      const bi = L.el('button', { text: 'Income', style: 'flex:1', class: c.kind === 'income' ? 'is-active' : '' });
      be.onclick = () => { c.kind = 'expense'; be.classList.add('is-active'); bi.classList.remove('is-active'); };
      bi.onclick = () => { c.kind = 'income'; bi.classList.add('is-active'); be.classList.remove('is-active'); };
      seg.appendChild(be); seg.appendChild(bi); kindField.appendChild(seg); body.appendChild(kindField);

      const iconField = L.el('div', { class: 'field' });
      iconField.innerHTML = `<label>Icon</label>`;
      const iconGrid = L.el('div', { class: 'icon-grid' });
      ICONS.forEach((ic) => {
        const b = L.el('button', { html: L.icon(ic, { size: 20 }), class: ic === c.icon ? 'is-sel' : '' });
        b.onclick = () => { c.icon = ic; L.$$('.icon-grid button', iconGrid).forEach((x) => x.classList.remove('is-sel')); b.classList.add('is-sel'); };
        iconGrid.appendChild(b);
      });
      iconField.appendChild(iconGrid); body.appendChild(iconField);

      const colorField = L.el('div', { class: 'field' });
      colorField.innerHTML = `<label>Color</label>`;
      const colorGrid = L.el('div', { class: 'color-grid' });
      COLORS.forEach((col) => {
        const d = L.el('div', { class: 'color-dot' + (col === c.color ? ' is-sel' : ''), style: `background:${col}` });
        d.onclick = () => { c.color = col; L.$$('.color-dot', colorGrid).forEach((x) => x.classList.remove('is-sel')); d.classList.add('is-sel'); };
        colorGrid.appendChild(d);
      });
      colorField.appendChild(colorGrid); body.appendChild(colorField);

      const dedRow = L.el('label', { class: 'row', style: 'justify-content:space-between;padding:12px;border:1px solid var(--line-2);border-radius:12px;cursor:pointer;margin-top:4px' });
      dedRow.innerHTML = `<div style="font-weight:650;font-size:14px">Tax deductible by default</div>`;
      const dedToggle = L.el('span', { class: 'toggle' });
      const dedCheck = L.el('input', { type: 'checkbox' }); if (c.deductible) dedCheck.checked = true;
      dedToggle.appendChild(dedCheck); dedToggle.appendChild(L.el('span', { class: 'track' })); dedToggle.appendChild(L.el('span', { class: 'knob' }));
      dedRow.appendChild(dedToggle); body.appendChild(dedRow);

      const foot = L.el('div', { class: 'modal__foot' });
      const cancel = L.el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const save = L.el('button', { class: 'btn btn--primary', text: 'Save category' });
      foot.appendChild(cancel); foot.appendChild(save);
      const { m, x } = shell(existing && existing.id ? 'Edit category' : 'New category', body, foot);
      const { close } = open(m);
      x.onclick = cancel.onclick = () => close();
      save.onclick = async () => {
        if (!nameInput.value.trim()) return L.toast('Name is required', 'error');
        await S.saveCategory({ id: existing && existing.id, name: nameInput.value.trim(), icon: c.icon, color: c.color, kind: c.kind, deductible: dedCheck.checked, order: existing ? existing.order : 999 });
        close(); L.toast('Category saved'); onSaved && onSaved();
      };
    },

    /* ---------- Account editor ---------- */
    async account(existing, onSaved) {
      const a = Object.assign({ name: '', type: 'bank', icon: 'landmark', color: '#2563EB', openingBalance: 0 }, existing || {});
      const body = L.el('div', {});
      const f1 = L.el('div', { class: 'field' }); f1.innerHTML = `<label>Account name</label>`;
      const nameInput = L.el('input', { class: 'input', placeholder: 'e.g. Business Checking', value: a.name }); f1.appendChild(nameInput); body.appendChild(f1);
      const row = L.el('div', { class: 'grid-2' });
      const f2 = L.el('div', { class: 'field', style: 'margin:0' }); f2.innerHTML = `<label>Type</label>`;
      const typeSel = L.el('select', { class: 'select' });
      [['bank','Bank account'],['card','Credit card'],['cash','Cash'],['savings','Savings'],['wallet','Wallet']].forEach(([v,t]) => { const o = L.el('option', { value: v, text: t }); if (v === a.type) o.selected = true; typeSel.appendChild(o); });
      f2.appendChild(typeSel);
      const f3 = L.el('div', { class: 'field', style: 'margin:0' }); f3.innerHTML = `<label>Opening balance</label>`;
      const balInput = L.el('input', { class: 'input', type: 'number', step: '0.01', value: a.openingBalance }); f3.appendChild(balInput);
      row.appendChild(f2); row.appendChild(f3); body.appendChild(row);

      const foot = L.el('div', { class: 'modal__foot' });
      const cancel = L.el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const save = L.el('button', { class: 'btn btn--primary', text: 'Save account' });
      foot.appendChild(cancel); foot.appendChild(save);
      const { m, x } = shell(existing && existing.id ? 'Edit account' : 'New account', body, foot);
      const { close } = open(m);
      x.onclick = cancel.onclick = () => close();
      const iconMap = { bank: 'landmark', card: 'card', cash: 'dollar', savings: 'wallet', wallet: 'wallet' };
      save.onclick = async () => {
        if (!nameInput.value.trim()) return L.toast('Name is required', 'error');
        await S.saveAccount({ id: existing && existing.id, name: nameInput.value.trim(), type: typeSel.value, icon: iconMap[typeSel.value] || 'landmark', color: a.color, openingBalance: parseFloat(balInput.value) || 0, order: existing ? existing.order : 999 });
        close(); L.toast('Account saved'); onSaved && onSaved();
      };
    },

    /* ---------- Budget editor ---------- */
    async budget(existing, onSaved) {
      const cats = (await S.categories()).filter((c) => c.kind === 'expense');
      const b = Object.assign({ categoryId: cats[0] ? cats[0].id : null, amount: '', period: 'monthly' }, existing || {});
      const body = L.el('div', {});
      const f1 = L.el('div', { class: 'field' }); f1.innerHTML = `<label>Category</label>`;
      const catSel = L.el('select', { class: 'select' });
      cats.forEach((c) => { const o = L.el('option', { value: c.id, text: c.name }); if (c.id === b.categoryId) o.selected = true; catSel.appendChild(o); });
      f1.appendChild(catSel); body.appendChild(f1);
      const f2 = L.el('div', { class: 'field' }); f2.innerHTML = `<label>Monthly limit</label>`;
      const grp = L.el('div', { class: 'input-group' });
      grp.appendChild(L.el('span', { class: 'prefix', text: (L.CURRENCIES[S.workspace.currency] || {}).symbol }));
      const amtInput = L.el('input', { class: 'input', type: 'number', step: '0.01', min: '0', placeholder: '0.00', value: b.amount });
      grp.appendChild(amtInput); f2.appendChild(grp); body.appendChild(f2);

      const foot = L.el('div', { class: 'modal__foot' });
      const cancel = L.el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const save = L.el('button', { class: 'btn btn--primary', text: 'Save budget' });
      foot.appendChild(cancel); foot.appendChild(save);
      const { m, x } = shell(existing && existing.id ? 'Edit budget' : 'New budget', body, foot);
      const { close } = open(m);
      x.onclick = cancel.onclick = () => close();
      save.onclick = async () => {
        const amount = parseFloat(amtInput.value);
        if (!(amount > 0)) return L.toast('Enter a limit', 'error');
        await S.saveBudget({ id: existing && existing.id, categoryId: catSel.value, amount, period: 'monthly' });
        close(); L.toast('Budget saved'); onSaved && onSaved();
      };
    },

    /* ---------- Recurring editor ---------- */
    async recurring(existing, onSaved) {
      const [cats, accts] = await Promise.all([S.categories(), S.accounts()]);
      const r = Object.assign({ type: 'expense', amount: '', currency: S.workspace.currency, categoryId: null, accountId: accts[0] ? accts[0].id : null, vendor: '', method: 'Card', note: '', frequency: 'monthly', nextDate: L.today(), active: true }, existing || {});
      const catsForType = () => cats.filter((c) => c.kind === r.type);
      if (!r.categoryId) { const l = catsForType(); r.categoryId = l[0] ? l[0].id : null; }
      const body = L.el('div', {});
      const seg = L.el('div', { class: 'segment', style: 'width:100%;margin-bottom:16px' });
      const be = L.el('button', { text: 'Expense', style: 'flex:1', class: r.type === 'expense' ? 'is-active' : '' });
      const bi = L.el('button', { text: 'Income', style: 'flex:1', class: r.type === 'income' ? 'is-active' : '' });
      seg.appendChild(be); seg.appendChild(bi); body.appendChild(seg);

      const f1 = L.el('div', { class: 'field' }); f1.innerHTML = `<label>Description / Vendor</label>`;
      const vInput = L.el('input', { class: 'input', placeholder: 'e.g. Office rent', value: r.vendor }); f1.appendChild(vInput); body.appendChild(f1);
      const row = L.el('div', { class: 'grid-2' });
      const f2 = L.el('div', { class: 'field', style: 'margin:0' }); f2.innerHTML = `<label>Amount</label>`;
      const grp = L.el('div', { class: 'input-group' }); grp.appendChild(L.el('span', { class: 'prefix', text: (L.CURRENCIES[r.currency] || {}).symbol }));
      const amtInput = L.el('input', { class: 'input', type: 'number', step: '0.01', value: r.amount }); grp.appendChild(amtInput); f2.appendChild(grp);
      const f3 = L.el('div', { class: 'field', style: 'margin:0' }); f3.innerHTML = `<label>Frequency</label>`;
      const freqSel = L.el('select', { class: 'select' });
      [['weekly','Weekly'],['biweekly','Every 2 weeks'],['monthly','Monthly'],['quarterly','Quarterly'],['yearly','Yearly']].forEach(([v,t]) => { const o = L.el('option', { value: v, text: t }); if (v === r.frequency) o.selected = true; freqSel.appendChild(o); });
      f3.appendChild(freqSel); row.appendChild(f2); row.appendChild(f3); body.appendChild(row);

      const row2 = L.el('div', { class: 'grid-2' });
      const f4 = L.el('div', { class: 'field', style: 'margin:0' }); f4.innerHTML = `<label>Category</label>`;
      const catSel = L.el('select', { class: 'select' });
      function fillCats() { catSel.innerHTML = ''; catsForType().forEach((c) => { const o = L.el('option', { value: c.id, text: c.name }); if (c.id === r.categoryId) o.selected = true; catSel.appendChild(o); }); }
      fillCats(); f4.appendChild(catSel);
      const f5 = L.el('div', { class: 'field', style: 'margin:0' }); f5.innerHTML = `<label>Next date</label>`;
      const dateInput = L.el('input', { class: 'input', type: 'date', value: r.nextDate }); f5.appendChild(dateInput);
      row2.appendChild(f4); row2.appendChild(f5); body.appendChild(row2);

      be.onclick = () => { r.type = 'expense'; be.classList.add('is-active'); bi.classList.remove('is-active'); r.categoryId = null; const l = catsForType(); r.categoryId = l[0] && l[0].id; fillCats(); };
      bi.onclick = () => { r.type = 'income'; bi.classList.add('is-active'); be.classList.remove('is-active'); r.categoryId = null; const l = catsForType(); r.categoryId = l[0] && l[0].id; fillCats(); };
      catSel.onchange = () => { r.categoryId = catSel.value; };

      const foot = L.el('div', { class: 'modal__foot' });
      let delBtn = existing && existing.id ? L.el('button', { class: 'btn btn--danger', text: 'Delete', style: 'margin-right:auto' }) : null;
      const cancel = L.el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const save = L.el('button', { class: 'btn btn--primary', text: 'Save' });
      if (delBtn) foot.appendChild(delBtn); foot.appendChild(cancel); foot.appendChild(save);
      const { m, x } = shell(existing && existing.id ? 'Edit recurring' : 'New recurring', body, foot);
      const { close } = open(m);
      x.onclick = cancel.onclick = () => close();
      if (delBtn) delBtn.onclick = async () => { await S.deleteRecurring(existing.id); close(); L.toast('Recurring removed'); onSaved && onSaved(); };
      save.onclick = async () => {
        const amount = parseFloat(amtInput.value);
        if (!(amount > 0)) return L.toast('Enter an amount', 'error');
        await S.saveRecurring({ id: existing && existing.id, type: r.type, amount, currency: r.currency, categoryId: catSel.value, accountId: r.accountId, vendor: vInput.value.trim(), method: r.method, note: r.note, frequency: freqSel.value, nextDate: dateInput.value, active: true });
        close(); L.toast('Recurring saved'); onSaved && onSaved();
      };
    },

    /* ---------- Receipt viewer ---------- */
    async viewReceipt(receiptId) {
      const r = await S.getReceipt(receiptId);
      if (!r) return L.toast('Receipt not found', 'error');
      const body = L.el('div', {}, [L.el('img', { src: r.dataUrl, style: 'width:100%;border-radius:12px' })]);
      const { m, x } = shell('Receipt', body, null, { wide: true });
      const { close } = open(m);
      x.onclick = () => close();
    },
  };

  L.Modals = Modals;
})();
