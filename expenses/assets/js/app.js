/* ============================================================
   Ledgerly — app.js
   App bootstrap: theme, auth gate, shell, hash router.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const S = L.Store, V = L.Views, M = L.Modals;
  const el = L.el;
  const root = document.getElementById('app-root');

  /* ---------- Theme ---------- */
  L.setTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ledgerly.theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0E0F12' : '#FFFFFF');
  };
  (function initTheme() {
    const saved = localStorage.getItem('ledgerly.theme');
    L.setTheme(saved || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  })();

  const NAV = [
    { section: 'Overview' },
    { route: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { route: 'transactions', icon: '🧾', label: 'Transactions' },
    { route: 'reports', icon: '📊', label: 'Reports' },
    { section: 'Manage' },
    { route: 'budgets', icon: '🎯', label: 'Budgets' },
    { route: 'recurring', icon: '🔁', label: 'Recurring' },
    { route: 'accounts', icon: '🏦', label: 'Accounts' },
    { route: 'categories', icon: '🏷️', label: 'Categories' },
    { section: 'System' },
    { route: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  const TITLES = {
    dashboard: ['Dashboard', 'Your money at a glance'],
    transactions: ['Transactions', 'Every expense and payment'],
    reports: ['Reports', 'Analyze and export your finances'],
    budgets: ['Budgets', 'Spending limits by category'],
    recurring: ['Recurring', 'Automated transactions'],
    accounts: ['Accounts', 'Balances across your wallets'],
    categories: ['Categories', 'Organize where money goes'],
    settings: ['Settings', 'Account, workspace & data'],
  };

  const app = {
    rangeName: 'this-month',
    range: L.rangePreset('this-month'),

    /* ---------- Routing ---------- */
    parseHash() {
      const h = (location.hash || '#dashboard').replace(/^#\/?/, '');
      const [path, query] = h.split('?');
      const params = {};
      if (query) query.split('&').forEach((p) => { const [k, v] = p.split('='); params[k] = decodeURIComponent(v || ''); });
      return { route: path || 'dashboard', params };
    },
    navigate(to) { location.hash = '#' + to; },

    async render() {
      const { route, params } = this.parseHash();
      const view = V[route] ? route : 'dashboard';
      // active nav
      L.$$('.nav__item').forEach((n) => n.classList.toggle('is-active', n.dataset.route === view));
      const [title, sub] = TITLES[view] || ['Ledgerly', ''];
      L.$('#pageTitle').textContent = title;
      L.$('#pageSub').textContent = sub;
      // close mobile sidebar
      L.$('.sidebar').classList.remove('is-open');
      L.$('.scrim') && L.$('.scrim').classList.remove('is-open');

      const content = L.$('#content');
      content.innerHTML = '<div style="display:grid;place-items:center;padding:80px"><div class="spinner"></div></div>';
      const ctx = {
        range: this.range, rangeName: this.rangeName, params,
        setRange: (name) => { this.rangeName = name; this.range = L.rangePreset(name); this.render(); },
        refresh: () => this.render(),
        rerenderShell: () => this.buildShell(),
        navigate: (to) => this.navigate(to),
      };
      try {
        const node = await V[view](ctx);
        content.innerHTML = '';
        content.appendChild(node);
        content.scrollTop = 0;
        window.scrollTo(0, 0);
      } catch (e) {
        console.error(e);
        content.innerHTML = '<div class="empty"><div class="empty__ic">⚠️</div><div class="empty__title">Something went wrong</div><div>' + L.escape(e.message) + '</div></div>';
      }
    },

    /* ---------- Shell ---------- */
    buildShell() {
      const wss = [];
      root.innerHTML = '';
      const scrim = el('div', { class: 'scrim' });
      scrim.onclick = () => { L.$('.sidebar').classList.remove('is-open'); scrim.classList.remove('is-open'); };

      const sidebar = el('aside', { class: 'sidebar' });
      const brand = el('div', { class: 'brand' });
      brand.innerHTML = `<div class="brand__logo">L</div><div class="brand__name">Ledgerly</div>`;
      sidebar.appendChild(brand);

      // workspace switcher
      const wsSwitch = el('div', { class: 'ws-switch' });
      wsSwitch.innerHTML = `<div class="ws-switch__ava">${L.escape(L.initials(S.workspace.name))}</div>
        <div style="flex:1;min-width:0"><div class="ws-switch__name">${L.escape(S.workspace.name)}</div><div class="ws-switch__meta">${S.workspace.currency} · ${L.titleCase(S.workspace.plan || 'free')} plan</div></div>
        <span class="muted">⌄</span>`;
      wsSwitch.onclick = (e) => this.workspaceMenu(wsSwitch);
      sidebar.appendChild(wsSwitch);

      // nav
      const nav = el('nav', { class: 'nav' });
      NAV.forEach((item) => {
        if (item.section) { nav.appendChild(el('div', { class: 'nav__section', text: item.section })); return; }
        const n = el('div', { class: 'nav__item', 'data-route': item.route });
        n.innerHTML = `<span class="ic">${item.icon}</span><span>${item.label}</span>`;
        n.onclick = () => this.navigate(item.route);
        nav.appendChild(n);
      });
      sidebar.appendChild(nav);
      sidebar.appendChild(el('div', { class: 'nav__spacer' }));

      // add button
      const addBtn = el('button', { class: 'btn btn--primary btn--block', html: '＋ Add transaction', style: 'margin:8px 0' });
      addBtn.onclick = () => M.transaction(null, () => this.render());
      sidebar.appendChild(addBtn);

      // user card
      const userCard = el('div', { class: 'user-card' });
      userCard.innerHTML = `<div class="ava">${L.escape(L.initials(S.user.name))}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:650;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${L.escape(S.user.name)}</div><div class="ws-switch__meta">${L.escape(S.user.email)}</div></div>`;
      userCard.onclick = (e) => this.userMenu(userCard);
      sidebar.appendChild(userCard);

      // main
      const main = el('main', { class: 'main' });
      const topbar = el('div', { class: 'topbar' });
      const ham = el('button', { class: 'iconbtn hamburger', html: '☰' });
      ham.onclick = () => { sidebar.classList.add('is-open'); scrim.classList.add('is-open'); };
      const titleBox = el('div', {});
      titleBox.innerHTML = `<div class="topbar__title" id="pageTitle">Dashboard</div><div class="topbar__sub" id="pageSub"></div>`;
      topbar.appendChild(ham); topbar.appendChild(titleBox);
      topbar.appendChild(el('div', { class: 'topbar__spacer' }));
      const themeBtn = el('button', { class: 'iconbtn no-print', title: 'Toggle theme', html: document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙' });
      themeBtn.onclick = () => { const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; L.setTheme(t); themeBtn.innerHTML = t === 'dark' ? '☀️' : '🌙'; };
      const quickAdd = el('button', { class: 'btn btn--primary btn--sm no-print hide-sm', html: '＋ New' });
      quickAdd.onclick = () => M.transaction(null, () => this.render());
      topbar.appendChild(themeBtn); topbar.appendChild(quickAdd);
      main.appendChild(topbar);
      main.appendChild(el('div', { class: 'content', id: 'content' }));

      const appEl = el('div', { class: 'app' });
      appEl.appendChild(sidebar); appEl.appendChild(main);
      root.appendChild(scrim); root.appendChild(appEl);

      // FAB
      const fab = el('button', { class: 'fab no-print', html: '＋', 'aria-label': 'Add transaction' });
      fab.onclick = () => M.transaction(null, () => this.render());
      root.appendChild(fab);
    },

    workspaceMenu(anchor) {
      closeMenus();
      const menu = el('div', { class: 'menu' });
      S.allWorkspaces().then((wss) => {
        wss.forEach((w) => {
          const it = el('div', { class: 'menu__item' });
          it.innerHTML = `<div class="ws-switch__ava" style="width:24px;height:24px;font-size:11px">${L.escape(L.initials(w.name))}</div> ${L.escape(w.name)} ${w.id === S.workspace.id ? '<span style="margin-left:auto;color:var(--accent)">✓</span>' : ''}`;
          it.onclick = async () => { await S.switchWorkspace(w.id); closeMenus(); this.buildShell(); this.render(); };
          menu.appendChild(it);
        });
        menu.appendChild(el('div', { class: 'menu__sep' }));
        const add = el('div', { class: 'menu__item', html: '＋ New workspace' });
        add.onclick = () => { closeMenus(); this.newWorkspace(); };
        menu.appendChild(add);
        positionMenu(menu, anchor);
      });
    },

    userMenu(anchor) {
      closeMenus();
      const menu = el('div', { class: 'menu' });
      const settings = el('div', { class: 'menu__item', html: '⚙️ Settings' });
      settings.onclick = () => { closeMenus(); this.navigate('settings'); };
      const plans = el('div', { class: 'menu__item', html: '⭐ Plans & billing' });
      plans.onclick = () => { location.href = '../index.html#pricing'; };
      const sep = el('div', { class: 'menu__sep' });
      const logout = el('div', { class: 'menu__item', html: '🚪 Log out', style: 'color:var(--danger)' });
      logout.onclick = async () => { await S.logout(); location.reload(); };
      menu.appendChild(settings); menu.appendChild(plans); menu.appendChild(sep); menu.appendChild(logout);
      positionMenu(menu, anchor, true);
    },

    newWorkspace() {
      const body = el('div', {});
      const nameF = el('input', { class: 'input', placeholder: 'e.g. Side Project LLC' });
      const curSel = el('select', { class: 'select' });
      Object.values(L.CURRENCIES).forEach((c) => curSel.appendChild(el('option', { value: c.code, text: `${c.symbol} ${c.name}` })));
      body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Workspace name' }), nameF]));
      body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Currency' }), curSel]));
      const seedRow = el('label', { class: 'row', style: 'gap:8px;cursor:pointer' });
      const seedCheck = el('input', { type: 'checkbox' });
      seedRow.appendChild(seedCheck); seedRow.appendChild(el('span', { class: 'muted', text: 'Add sample data to explore' }));
      body.appendChild(seedRow);
      const foot = el('div', { class: 'modal__foot' });
      const cancel = el('button', { class: 'btn btn--ghost', text: 'Cancel' });
      const create = el('button', { class: 'btn btn--primary', text: 'Create workspace' });
      foot.appendChild(cancel); foot.appendChild(create);
      const { close } = simpleModal('New workspace', body, foot);
      cancel.onclick = () => close();
      create.onclick = async () => {
        if (!nameF.value.trim()) return L.toast('Name required', 'error');
        const ws = await S.createWorkspace(S.user.id, { name: nameF.value.trim(), currency: curSel.value, seed: seedCheck.checked });
        await S.switchWorkspace(ws.id);
        close(); this.buildShell(); this.navigate('dashboard'); this.render(); L.toast('Workspace created');
      };
    },

    async start() {
      // run recurring posts
      const posted = await S.runRecurring();
      this.buildShell();
      window.addEventListener('hashchange', () => this.render());
      await this.render();
      if (posted) L.toast(`${posted} recurring transaction${posted > 1 ? 's' : ''} posted`);
    },
  };

  /* ---------- Menus positioning ---------- */
  function closeMenus() { L.$$('.menu').forEach((m) => m.remove()); }
  function positionMenu(menu, anchor, up) {
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    if (up) menu.style.top = (r.top - menu.offsetHeight - 8) + 'px';
    else menu.style.top = (r.bottom + 6) + 'px';
    menu.style.width = Math.max(r.width, 200) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function h(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', h); }
    }), 0);
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
    x.onclick = close; overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    return { close };
  }

  /* ============================================================
     AUTH GATE
     ============================================================ */
  const Auth = {
    render(mode) {
      mode = mode || 'login';
      root.innerHTML = '';
      const wrap = el('div', { class: 'auth' });
      wrap.innerHTML = `
        <div class="auth__aside">
          <div class="auth__brand"><div class="brand__logo" style="width:40px;height:40px">L</div><span>Ledgerly</span></div>
          <div class="auth__pitch">
            <h1>Expense management,<br>beautifully simple.</h1>
            <p>Track every dollar, capture receipts, set budgets and know exactly where your business stands — all in one gorgeous workspace.</p>
            <ul class="auth__feats">
              <li>📸 Snap & store receipts</li>
              <li>📊 Real-time dashboards & reports</li>
              <li>🧾 Tax-ready deductible tracking</li>
              <li>🔁 Automated recurring expenses</li>
            </ul>
          </div>
          <div class="auth__foot">Your data stays private on your device.</div>
        </div>
        <div class="auth__main"></div>`;
      root.appendChild(wrap);
      this.renderForm(wrap.querySelector('.auth__main'), mode);
    },

    renderForm(host, mode) {
      host.innerHTML = '';
      const themeBtn = el('button', { class: 'iconbtn', html: document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙', style: 'position:absolute;top:22px;right:22px' });
      themeBtn.onclick = () => { const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; L.setTheme(t); themeBtn.innerHTML = t === 'dark' ? '☀️' : '🌙'; };
      host.appendChild(themeBtn);

      const box = el('div', { class: 'auth__box' });
      const isSignup = mode === 'signup';
      box.innerHTML = `<h2>${isSignup ? 'Create your account' : 'Welcome back'}</h2>
        <p class="muted" style="margin-top:4px">${isSignup ? 'Start tracking in under a minute.' : 'Log in to your workspace.'}</p>`;
      const form = el('form', { class: 'stack', style: 'margin-top:22px' });

      const nameInput = el('input', { class: 'input', placeholder: 'Jane Doe', autocomplete: 'name' });
      const bizInput = el('input', { class: 'input', placeholder: 'Acme Studio', autocomplete: 'organization' });
      const emailInput = el('input', { class: 'input', type: 'email', placeholder: 'you@company.com', autocomplete: 'email', required: 'true' });
      const passInput = el('input', { class: 'input', type: 'password', placeholder: '••••••••', autocomplete: isSignup ? 'new-password' : 'current-password', required: 'true' });
      const curSel = el('select', { class: 'select' });
      Object.values(L.CURRENCIES).forEach((c) => { const o = el('option', { value: c.code, text: `${c.symbol} ${c.name}` }); if (c.code === 'USD') o.selected = true; curSel.appendChild(o); });

      if (isSignup) {
        form.appendChild(field('Full name', nameInput));
        form.appendChild(el('div', { class: 'grid-2' }, [field('Business name', bizInput), field('Currency', curSel)]));
      }
      form.appendChild(field('Email', emailInput));
      form.appendChild(field('Password', passInput));

      const err = el('div', { class: 'field-err', style: 'display:none' });
      form.appendChild(err);
      const submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', text: isSignup ? 'Create account' : 'Log in' });
      form.appendChild(submit);
      box.appendChild(form);

      const alt = el('div', { class: 'auth__alt' });
      alt.innerHTML = isSignup
        ? `Already have an account? <a href="#" data-mode="login">Log in</a>`
        : `New to Ledgerly? <a href="#" data-mode="signup">Create an account</a>`;
      alt.querySelector('a').onclick = (e) => { e.preventDefault(); this.render(e.target.dataset.mode); };
      box.appendChild(alt);

      if (!isSignup) {
        const demo = el('button', { class: 'btn btn--ghost btn--block', text: '✨ Try the live demo', style: 'margin-top:14px' });
        demo.onclick = () => this.demo();
        box.appendChild(demo);
      }
      host.appendChild(box);
      setTimeout(() => (isSignup ? nameInput : emailInput).focus(), 60);

      form.onsubmit = async (e) => {
        e.preventDefault();
        err.style.display = 'none';
        submit.disabled = true; submit.textContent = isSignup ? 'Creating…' : 'Logging in…';
        try {
          if (isSignup) {
            if ((passInput.value || '').length < 6) throw new Error('Password must be at least 6 characters.');
            await S.signup({ name: nameInput.value.trim(), email: emailInput.value, password: passInput.value, business: bizInput.value.trim(), currency: curSel.value });
          } else {
            await S.login({ email: emailInput.value, password: passInput.value });
          }
          app.start();
        } catch (ex) {
          err.textContent = ex.message; err.style.display = 'block';
          submit.disabled = false; submit.textContent = isSignup ? 'Create account' : 'Log in';
        }
      };
    },

    async demo() {
      const email = 'demo@ledgerly.app';
      try { await S.login({ email, password: 'demo1234' }); }
      catch (e) { await S.signup({ name: 'Demo User', email, password: 'demo1234', business: 'Ledgerly Demo Co.', currency: 'USD' }); }
      app.start();
    },
  };

  function field(label, input) {
    const f = el('div', { class: 'field', style: 'margin:0' });
    f.appendChild(el('label', { text: label })); f.appendChild(input);
    return f;
  }

  /* ============================================================
     BOOT
     ============================================================ */
  (async function boot() {
    // register service worker (best effort)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('../sw.js').catch(() => {});
    }
    try {
      const ok = await S.restore();
      if (ok) app.start();
      else Auth.render(location.hash === '#signup' ? 'signup' : 'login');
    } catch (e) {
      console.error(e);
      Auth.render('login');
    }
    // hide splash
    const splash = document.getElementById('splash');
    if (splash) splash.remove();
  })();

  window.L.app = app;
})();
