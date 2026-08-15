/* ============================================================
   Ledgerly — store.js
   Domain layer: auth, workspaces, seed data, CRUD and the
   analytics/aggregation engine. Sits on top of L.DB.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const DB = L.DB;

  const SESSION_KEY = 'ledgerly.session';

  /* ---------- Default category set ---------- */
  const DEFAULT_CATEGORIES = [
    { name: 'Office & Supplies', icon: 'briefcase', color: '#2563EB', kind: 'expense', deductible: true },
    { name: 'Software & SaaS', icon: 'monitor', color: '#6938EF', kind: 'expense', deductible: true },
    { name: 'Travel', icon: 'plane', color: '#0E7090', kind: 'expense', deductible: true },
    { name: 'Meals & Entertainment', icon: 'utensils', color: '#B54708', kind: 'expense', deductible: true },
    { name: 'Marketing & Ads', icon: 'megaphone', color: '#C11574', kind: 'expense', deductible: true },
    { name: 'Rent & Utilities', icon: 'building', color: '#107569', kind: 'expense', deductible: true },
    { name: 'Payroll & Contractors', icon: 'users', color: '#4F46E5', kind: 'expense', deductible: true },
    { name: 'Professional Services', icon: 'scale', color: '#3538CD', kind: 'expense', deductible: true },
    { name: 'Equipment', icon: 'monitor', color: '#5925DC', kind: 'expense', deductible: true },
    { name: 'Insurance', icon: 'shield', color: '#0E7090', kind: 'expense', deductible: true },
    { name: 'Fuel & Mileage', icon: 'fuel', color: '#C4320A', kind: 'expense', deductible: true },
    { name: 'Bank & Fees', icon: 'landmark', color: '#475467', kind: 'expense', deductible: false },
    { name: 'Taxes', icon: 'receipt', color: '#344054', kind: 'expense', deductible: false },
    { name: 'Other Expense', icon: 'box', color: '#667085', kind: 'expense', deductible: false },
    { name: 'Sales Revenue', icon: 'trendingUp', color: '#067647', kind: 'income', deductible: false },
    { name: 'Consulting Income', icon: 'handshake', color: '#107569', kind: 'income', deductible: false },
    { name: 'Other Income', icon: 'plusCircle', color: '#12B76A', kind: 'income', deductible: false },
  ];

  const DEFAULT_ACCOUNTS = [
    { name: 'Business Checking', type: 'bank', icon: 'landmark', color: '#2563EB' },
    { name: 'Business Card', type: 'card', icon: 'card', color: '#6938EF' },
    { name: 'Cash', type: 'cash', icon: 'dollar', color: '#067647' },
  ];

  const PAYMENT_METHODS = ['Card', 'Bank Transfer', 'Cash', 'Cheque', 'PayPal', 'Direct Debit', 'Other'];

  const Store = {
    PAYMENT_METHODS,
    DEFAULT_CATEGORIES,
    session: null,     // { userId, wsId }
    user: null,
    workspace: null,

    /* ================= AUTH ================= */
    async signup({ name, email, password, business, currency }) {
      email = (email || '').trim().toLowerCase();
      if (!email || !password) throw new Error('Email and password are required.');
      const existing = await DB.oneByIndex('users', 'email', email).catch(() => null);
      if (existing) throw new Error('An account with that email already exists.');
      const pwHash = await L.hash(password + '::' + email);
      const user = {
        id: L.uid('usr'), name: name || email.split('@')[0], email, pwHash,
        createdAt: Date.now(), plan: 'pro', role: 'owner', suspended: false,
      };
      await DB.put('users', user);
      const ws = await this.createWorkspace(user.id, {
        name: business || (user.name + "'s Business"),
        currency: currency || 'USD',
        seed: true,
      });
      // Every new account starts on a 14-day Pro trial.
      if (L.Billing) await L.Billing.startTrial(user.id);
      await this._addOwnerMember(ws.id, user);
      await this._setSession(user.id, ws.id);
      return { user, ws };
    },

    async login({ email, password }) {
      email = (email || '').trim().toLowerCase();
      const user = await DB.oneByIndex('users', 'email', email).catch(() => null);
      if (!user) throw new Error('No account found for that email.');
      const pwHash = await L.hash(password + '::' + email);
      if (pwHash !== user.pwHash) throw new Error('Incorrect password.');
      if (user.suspended) throw new Error('This account has been suspended. Contact support.');
      if (L.Billing) await L.Billing.ensureSubscription(user.id);
      const wss = await DB.byIndex('workspaces', 'owner', user.id);
      const wsId = (wss[0] && wss[0].id) || (await this.createWorkspace(user.id, { name: user.name + "'s Business", currency: 'USD', seed: true })).id;
      await this._setSession(user.id, wsId);
      return user;
    },

    async logout() {
      localStorage.removeItem(SESSION_KEY);
      this.session = this.user = this.workspace = null;
    },

    async restore() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        const user = await DB.get('users', s.userId);
        if (!user) return false;
        let ws = await DB.get('workspaces', s.wsId);
        if (!ws) {
          const wss = await DB.byIndex('workspaces', 'owner', user.id);
          ws = wss[0];
          if (!ws) return false;
        }
        this.session = { userId: user.id, wsId: ws.id };
        this.user = user; this.workspace = ws;
        return true;
      } catch (e) { return false; }
    },

    async _setSession(userId, wsId) {
      this.session = { userId, wsId };
      this.user = await DB.get('users', userId);
      this.workspace = await DB.get('workspaces', wsId);
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    },

    async switchWorkspace(wsId) {
      const ws = await DB.get('workspaces', wsId);
      if (!ws) throw new Error('Workspace not found');
      this.workspace = ws;
      this.session.wsId = wsId;
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    },

    async updateUser(patch) {
      Object.assign(this.user, patch);
      await DB.put('users', this.user);
      return this.user;
    },

    /* ================= ENTITLEMENTS ================= */
    async entitlements() {
      const ent = await L.Billing.entitlements(this.user.id);
      this._ent = ent;
      return ent;
    },
    isSuper() { return !!(this.user && this.user.role === 'superadmin'); },
    async canAddWorkspace() {
      const ent = await this.entitlements();
      const wss = await this.allWorkspaces();
      return wss.length < ent.limits.workspaces;
    },

    /* ================= TEAM / SEATS ================= */
    async _addOwnerMember(wsId, user) {
      const existing = (await DB.byIndex('members', 'ws', wsId)).find((m) => m.email === user.email);
      if (existing) return existing;
      const m = { id: L.uid('mem'), ws: wsId, name: user.name, email: user.email, role: 'owner', status: 'active', invitedAt: Date.now(), userId: user.id };
      await DB.put('members', m);
      return m;
    },
    members(wsId) { return DB.byIndex('members', 'ws', wsId || this._ws()); },
    async inviteMember({ name, email, role }) {
      email = (email || '').trim().toLowerCase();
      if (!email) throw new Error('Email is required.');
      const list = await this.members();
      if (list.find((m) => m.email === email)) throw new Error('That person is already a member.');
      const ent = await this.entitlements();
      if (list.length >= ent.limits.seats) throw new Error(`Your plan includes ${ent.limits.seats} seat${ent.limits.seats === 1 ? '' : 's'}. Upgrade to add more.`);
      const m = { id: L.uid('mem'), ws: this._ws(), name: name || email.split('@')[0], email, role: role || 'member', status: 'invited', invitedAt: Date.now() };
      await DB.put('members', m);
      return m;
    },
    async updateMember(m) { await DB.put('members', m); return m; },
    async removeMember(id) { await DB.del('members', id); },

    /* ================= SUPER ADMIN ================= */
    async ensureSuperAdmin() {
      const existing = await DB.oneByIndex('users', 'email', 'admin@ledgerly.app').catch(() => null);
      if (existing) { if (existing.role !== 'superadmin') { existing.role = 'superadmin'; await DB.put('users', existing); } return existing; }
      const email = 'admin@ledgerly.app';
      const pwHash = await L.hash('admin1234' + '::' + email);
      const user = { id: L.uid('usr'), name: 'Platform Admin', email, pwHash, createdAt: Date.now(), plan: 'business', role: 'superadmin', suspended: false };
      await DB.put('users', user);
      return user;
    },
    async adminAllUsers() { return DB.getAll('users'); },
    async adminAllSubscriptions() { return DB.getAll('subscriptions'); },
    async adminAllInvoices() { return DB.getAll('invoices'); },
    async adminAllWorkspaces() { return DB.getAll('workspaces'); },
    async adminLog(action, detail) {
      const entry = { id: L.uid('log'), action, detail: detail || '', actor: this.user ? this.user.email : 'system', at: Date.now() };
      await DB.put('adminlog', entry);
      return entry;
    },
    async adminAllLogs() { const l = await DB.getAll('adminlog'); return l.sort((a, b) => b.at - a.at); },
    async adminSuspendUser(userId, suspend) {
      const u = await DB.get('users', userId); if (!u) return;
      u.suspended = !!suspend; await DB.put('users', u);
      await this.adminLog(suspend ? 'suspend_user' : 'unsuspend_user', u.email);
      return u;
    },
    async adminDeleteUser(userId) {
      const wss = await DB.byIndex('workspaces', 'owner', userId);
      for (const w of wss) {
        for (const store of ['accounts', 'categories', 'transactions', 'budgets', 'recurring', 'vendors', 'members']) {
          const items = await DB.byIndex(store, 'ws', w.id);
          for (const it of items) await DB.del(store, it.id);
        }
        await DB.del('workspaces', w.id);
      }
      for (const store of ['subscriptions', 'invoices', 'paymentMethods']) {
        const items = await DB.byIndex(store, 'userId', userId);
        for (const it of items) await DB.del(store, it.id);
      }
      const u = await DB.get('users', userId);
      await DB.del('users', userId);
      await this.adminLog('delete_user', u ? u.email : userId);
    },
    async adminMetrics() {
      const [users, subs, invoices, wss] = await Promise.all([
        this.adminAllUsers(), this.adminAllSubscriptions(), this.adminAllInvoices(), this.adminAllWorkspaces(),
      ]);
      const B = L.Billing;
      // Exclude platform admins from customer-facing metrics.
      const adminIds = new Set(users.filter((u) => u.role === 'superadmin').map((u) => u.id));
      const custSubs = subs.filter((s) => !adminIds.has(s.userId));
      let mrr = 0, trialing = 0, activePaid = 0, canceled = 0;
      const planCounts = { starter: 0, pro: 0, business: 0 };
      for (const s of custSubs) {
        const eff = B.effectivePlanId(s);
        planCounts[eff] = (planCounts[eff] || 0) + 1;
        if (s.status === 'trialing' && Date.now() < s.trialEnd) trialing++;
        if (s.status === 'canceled') canceled++;
        if ((s.status === 'active') && !s.comp && eff !== 'starter') { mrr += B.monthlyEquivalent(s.planId, s.billingCycle); activePaid++; }
      }
      const revenue = L.sum(invoices.filter((i) => i.status === 'paid'), (i) => i.amount);
      const refunded = L.sum(invoices.filter((i) => i.status === 'refunded'), (i) => i.amount);
      const realUsers = users.filter((u) => u.role !== 'superadmin');
      return {
        users, subs, invoices, workspaces: wss,
        totalUsers: realUsers.length, totalWorkspaces: wss.length,
        mrr, arr: mrr * 12, activePaid, trialing, canceled,
        revenue, refunded, netRevenue: revenue - refunded,
        planCounts, invoiceCount: invoices.length,
      };
    },

    /* ================= IMPERSONATION ================= */
    async impersonate(userId) {
      const target = await DB.get('users', userId);
      if (!target) throw new Error('User not found');
      const wss = await DB.byIndex('workspaces', 'owner', userId);
      if (!wss[0]) throw new Error('This user has no workspace to view.');
      // remember who we were
      localStorage.setItem('ledgerly.impersonator', JSON.stringify({ userId: this.user.id, wsId: this.workspace ? this.workspace.id : (wss[0].id) }));
      await this.adminLog('impersonate', target.email);
      await this._setSession(userId, wss[0].id);
    },
    isImpersonating() { return !!localStorage.getItem('ledgerly.impersonator'); },
    async stopImpersonation() {
      const raw = localStorage.getItem('ledgerly.impersonator');
      localStorage.removeItem('ledgerly.impersonator');
      if (!raw) return false;
      const who = JSON.parse(raw);
      await this._setSession(who.userId, who.wsId);
      return true;
    },

    /* ================= WORKSPACES ================= */
    async createWorkspace(ownerId, { name, currency, seed }) {
      const ws = {
        id: L.uid('ws'), owner: ownerId, name: name || 'My Business',
        currency: currency || 'USD', createdAt: Date.now(),
        fiscalStartMonth: 1, taxRate: 0,
        plan: 'free',
      };
      await DB.put('workspaces', ws);
      // seed categories + accounts
      const cats = DEFAULT_CATEGORIES.map((c, i) => ({ id: L.uid('cat'), ws: ws.id, order: i, ...c }));
      await DB.putMany('categories', cats);
      const accts = DEFAULT_ACCOUNTS.map((a, i) => ({ id: L.uid('acc'), ws: ws.id, order: i, openingBalance: 0, ...a }));
      await DB.putMany('accounts', accts);
      if (seed) await this._seedSampleData(ws, cats, accts);
      return ws;
    },

    async allWorkspaces() {
      if (!this.user) return [];
      return DB.byIndex('workspaces', 'owner', this.user.id);
    },

    async updateWorkspace(patch) {
      Object.assign(this.workspace, patch);
      await DB.put('workspaces', this.workspace);
      return this.workspace;
    },

    async _seedSampleData(ws, cats, accts) {
      const expCats = cats.filter((c) => c.kind === 'expense');
      const incCats = cats.filter((c) => c.kind === 'income');
      const vendorsByCat = {
        'Office & Supplies': ['Staples', 'Amazon Business', 'IKEA'],
        'Software & SaaS': ['Adobe', 'Slack', 'Notion', 'Google Workspace', 'Figma'],
        'Travel': ['Delta Airlines', 'Marriott', 'Uber', 'Airbnb'],
        'Meals & Entertainment': ['Starbucks', 'Chipotle', 'The Corner Bistro'],
        'Marketing & Ads': ['Google Ads', 'Meta Ads', 'Mailchimp'],
        'Rent & Utilities': ['WeWork', 'ConEd', 'Verizon'],
        'Professional Services': ['Deloitte', 'LegalZoom'],
        'Fuel & Mileage': ['Shell', 'BP', 'Chevron'],
      };
      const txns = [];
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
        // ~1.3 expenses per day on average
        const n = Math.random() < 0.4 ? 0 : (Math.random() < 0.7 ? 1 : 2);
        for (let k = 0; k < n; k++) {
          const cat = expCats[Math.floor(Math.random() * expCats.length)];
          const vList = vendorsByCat[cat.name] || ['General Vendor'];
          const vendor = vList[Math.floor(Math.random() * vList.length)];
          const base = { 'Software & SaaS': 45, 'Travel': 320, 'Rent & Utilities': 900, 'Payroll & Contractors': 1200, 'Marketing & Ads': 180, 'Meals & Entertainment': 38, 'Equipment': 240 }[cat.name] || 60;
          const amount = Math.round((base * (0.5 + Math.random() * 1.4)) * 100) / 100;
          txns.push({
            id: L.uid('txn'), ws: ws.id, type: 'expense', amount, currency: ws.currency,
            date: L.dateKey(d), categoryId: cat.id, accountId: accts[Math.floor(Math.random() * accts.length)].id,
            vendor, method: PAYMENT_METHODS[Math.floor(Math.random() * 4)],
            note: '', tags: [], deductible: cat.deductible, receiptId: null, createdAt: Date.now(),
          });
        }
        // monthly-ish income
        if (d.getDate() === 15 || d.getDate() === 28) {
          const cat = incCats[Math.floor(Math.random() * incCats.length)];
          txns.push({
            id: L.uid('txn'), ws: ws.id, type: 'income',
            amount: Math.round((3000 + Math.random() * 6000) * 100) / 100, currency: ws.currency,
            date: L.dateKey(d), categoryId: cat.id, accountId: accts[0].id,
            vendor: ['Acme Corp', 'Globex', 'Initech', 'Umbrella LLC'][Math.floor(Math.random() * 4)],
            method: 'Bank Transfer', note: 'Client payment', tags: ['client'], deductible: false, receiptId: null, createdAt: Date.now(),
          });
        }
      }
      await DB.putMany('transactions', txns);
      // seed a few budgets
      const budgets = [
        { cat: 'Software & SaaS', amount: 600 },
        { cat: 'Travel', amount: 2000 },
        { cat: 'Marketing & Ads', amount: 1500 },
        { cat: 'Meals & Entertainment', amount: 800 },
      ].map((b) => {
        const c = expCats.find((x) => x.name === b.cat);
        return { id: L.uid('bud'), ws: ws.id, categoryId: c.id, amount: b.amount, period: 'monthly', createdAt: Date.now() };
      });
      await DB.putMany('budgets', budgets);
      // seed vendors
      const vSet = new Set();
      Object.values(vendorsByCat).flat().forEach((v) => vSet.add(v));
      const vendors = Array.from(vSet).map((name) => ({ id: L.uid('ven'), ws: ws.id, name, createdAt: Date.now() }));
      await DB.putMany('vendors', vendors);
      // seed one recurring
      const saas = expCats.find((c) => c.name === 'Software & SaaS');
      await DB.put('recurring', {
        id: L.uid('rec'), ws: ws.id, type: 'expense', amount: 52, currency: ws.currency,
        categoryId: saas.id, accountId: accts[1].id, vendor: 'Adobe', method: 'Card',
        note: 'Creative Cloud', frequency: 'monthly', nextDate: L.addMonths(L.today(), 0),
        active: true, createdAt: Date.now(),
      });
    },

    /* ================= SCOPED READERS ================= */
    _ws() { return this.workspace.id; },
    categories() { return DB.byIndex('categories', 'ws', this._ws()); },
    accounts() { return DB.byIndex('accounts', 'ws', this._ws()); },
    transactions() { return DB.byIndex('transactions', 'ws', this._ws()); },
    budgets() { return DB.byIndex('budgets', 'ws', this._ws()); },
    recurring() { return DB.byIndex('recurring', 'ws', this._ws()); },
    vendors() { return DB.byIndex('vendors', 'ws', this._ws()); },

    /* ================= CRUD ================= */
    async saveTransaction(t) {
      const isNew = !t.id;
      const rec = Object.assign({
        id: L.uid('txn'), ws: this._ws(), type: 'expense', amount: 0,
        currency: this.workspace.currency, date: L.today(), categoryId: null,
        accountId: null, vendor: '', method: 'Card', note: '', tags: [],
        deductible: false, receiptId: null, createdAt: Date.now(),
      }, t);
      if (!rec.id) rec.id = L.uid('txn');
      rec.ws = this._ws();
      rec.amount = Math.round(Number(rec.amount) * 100) / 100;
      rec.updatedAt = Date.now();
      await DB.put('transactions', rec);
      if (rec.vendor) await this._ensureVendor(rec.vendor);
      return rec;
    },
    async deleteTransaction(id) {
      const t = await DB.get('transactions', id);
      if (t && t.receiptId) await DB.del('receipts', t.receiptId).catch(() => {});
      await DB.del('transactions', id);
    },
    async _ensureVendor(name) {
      const existing = (await this.vendors()).find((v) => v.name.toLowerCase() === name.toLowerCase());
      if (!existing) await DB.put('vendors', { id: L.uid('ven'), ws: this._ws(), name, createdAt: Date.now() });
    },

    async saveReceipt(dataUrl) {
      const id = L.uid('rcpt');
      await DB.put('receipts', { id, dataUrl });
      return id;
    },
    getReceipt(id) { return DB.get('receipts', id); },

    async saveCategory(c) {
      const rec = Object.assign({ id: L.uid('cat'), ws: this._ws(), icon: 'tag', color: '#2563EB', kind: 'expense', deductible: false, order: 999 }, c);
      if (!rec.id) rec.id = L.uid('cat');
      rec.ws = this._ws();
      await DB.put('categories', rec);
      return rec;
    },
    async deleteCategory(id) { await DB.del('categories', id); },

    async saveAccount(a) {
      const rec = Object.assign({ id: L.uid('acc'), ws: this._ws(), type: 'bank', icon: 'landmark', color: '#2563EB', openingBalance: 0, order: 999 }, a);
      if (!rec.id) rec.id = L.uid('acc');
      rec.ws = this._ws();
      rec.openingBalance = Number(rec.openingBalance) || 0;
      await DB.put('accounts', rec);
      return rec;
    },
    async deleteAccount(id) { await DB.del('accounts', id); },

    async saveBudget(b) {
      const rec = Object.assign({ id: L.uid('bud'), ws: this._ws(), period: 'monthly', createdAt: Date.now() }, b);
      if (!rec.id) rec.id = L.uid('bud');
      rec.ws = this._ws();
      rec.amount = Number(rec.amount) || 0;
      await DB.put('budgets', rec);
      return rec;
    },
    async deleteBudget(id) { await DB.del('budgets', id); },

    async saveRecurring(r) {
      const rec = Object.assign({ id: L.uid('rec'), ws: this._ws(), type: 'expense', frequency: 'monthly', active: true, createdAt: Date.now() }, r);
      if (!rec.id) rec.id = L.uid('rec');
      rec.ws = this._ws();
      rec.amount = Number(rec.amount) || 0;
      await DB.put('recurring', rec);
      return rec;
    },
    async deleteRecurring(id) { await DB.del('recurring', id); },

    /* Post any recurring items that are due; returns count posted. */
    async runRecurring() {
      const recs = await this.recurring();
      const today = L.today();
      let posted = 0;
      for (const r of recs) {
        if (!r.active) continue;
        let guard = 0;
        while (r.nextDate <= today && guard < 60) {
          await this.saveTransaction({
            type: r.type, amount: r.amount, currency: r.currency, date: r.nextDate,
            categoryId: r.categoryId, accountId: r.accountId, vendor: r.vendor,
            method: r.method, note: (r.note || '') + ' (recurring)', tags: ['recurring'], deductible: r.deductible,
          });
          r.nextDate = advance(r.nextDate, r.frequency);
          posted++; guard++;
        }
        await DB.put('recurring', r);
      }
      return posted;
    },

    /* ================= ANALYTICS ================= */
    // Convert a transaction amount into the workspace's base currency.
    baseAmount(t) {
      return L.convert(t.amount, t.currency || this.workspace.currency, this.workspace.currency);
    },

    async snapshot(range) {
      const [txns, cats, accts, budgets] = await Promise.all([
        this.transactions(), this.categories(), this.accounts(), this.budgets(),
      ]);
      const catMap = new Map(cats.map((c) => [c.id, c]));
      const inRange = txns.filter((t) => t.date >= range.from && t.date <= range.to);
      const expenses = inRange.filter((t) => t.type === 'expense');
      const income = inRange.filter((t) => t.type === 'income');
      const totalExpense = L.sum(expenses, (t) => this.baseAmount(t));
      const totalIncome = L.sum(income, (t) => this.baseAmount(t));

      // by category (expenses)
      const byCat = [];
      const catGroups = L.groupBy(expenses, (t) => t.categoryId);
      for (const [cid, list] of catGroups) {
        const c = catMap.get(cid);
        byCat.push({
          id: cid, name: c ? c.name : 'Uncategorized', icon: c ? c.icon : 'tag', color: c ? c.color : '#98A2B3',
          total: L.sum(list, (t) => this.baseAmount(t)), count: list.length,
        });
      }
      byCat.sort((a, b) => b.total - a.total);

      // by month series (last 6 months within/around range)
      const series = this.monthlySeries(txns);

      // deductible total
      const deductible = L.sum(expenses.filter((t) => t.deductible), (t) => this.baseAmount(t));

      // account balances (all-time)
      const balances = accts.map((a) => {
        const forAcc = txns.filter((t) => t.accountId === a.id);
        const bal = (a.openingBalance || 0) + L.sum(forAcc, (t) => (t.type === 'income' ? 1 : -1) * this.baseAmount(t));
        return { ...a, balance: bal };
      });

      // budget status (current month)
      const monthRange = L.rangePreset('this-month');
      const monthExp = txns.filter((t) => t.type === 'expense' && t.date >= monthRange.from && t.date <= monthRange.to);
      const budgetStatus = budgets.map((b) => {
        const spent = L.sum(monthExp.filter((t) => t.categoryId === b.categoryId), (t) => this.baseAmount(t));
        const c = catMap.get(b.categoryId);
        return { ...b, name: c ? c.name : '—', icon: c ? c.icon : 'tag', color: c ? c.color : '#2563EB', spent, pct: b.amount ? spent / b.amount : 0 };
      }).sort((a, b) => b.pct - a.pct);

      return {
        range, catMap, cats, accounts: accts,
        count: inRange.length, expenseCount: expenses.length, incomeCount: income.length,
        totalExpense, totalIncome, net: totalIncome - totalExpense,
        avgExpense: expenses.length ? totalExpense / expenses.length : 0,
        byCat, series, deductible, balances, budgetStatus,
        topCategory: byCat[0] || null,
        expenses, income, inRange, all: txns,
      };
    },

    monthlySeries(txns, months) {
      months = months || 6;
      const now = new Date();
      const keys = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(L.dateKey(d).slice(0, 7));
      }
      const map = new Map(keys.map((k) => [k, { month: k, expense: 0, income: 0 }]));
      for (const t of txns) {
        const mk = t.date.slice(0, 7);
        if (map.has(mk)) {
          const row = map.get(mk);
          row[t.type === 'income' ? 'income' : 'expense'] += this.baseAmount(t);
        }
      }
      return Array.from(map.values());
    },

    /* Daily series for a range (for the trend line) */
    dailySeries(txns, range) {
      const map = new Map();
      let cur = range.from;
      let guard = 0;
      while (cur <= range.to && guard < 800) { map.set(cur, 0); cur = L.dateKey(new Date(L.parseDate(cur).getTime() + 86400000)); guard++; }
      for (const t of txns) {
        if (t.type === 'expense' && map.has(t.date)) map.set(t.date, map.get(t.date) + this.baseAmount(t));
      }
      return Array.from(map.entries()).map(([date, v]) => ({ date, value: v }));
    },

    /* ================= BACKUP / IMPORT ================= */
    async exportAll() {
      const [categories, accounts, transactions, budgets, recurring, vendors] = await Promise.all([
        this.categories(), this.accounts(), this.transactions(), this.budgets(), this.recurring(), this.vendors(),
      ]);
      return {
        app: 'ledgerly', version: 1, exportedAt: new Date().toISOString(),
        workspace: this.workspace,
        data: { categories, accounts, transactions, budgets, recurring, vendors },
      };
    },

    async importAll(payload, { replace }) {
      if (!payload || payload.app !== 'ledgerly') throw new Error('Not a Ledgerly backup file.');
      const d = payload.data || {};
      if (replace) {
        for (const store of ['categories', 'accounts', 'transactions', 'budgets', 'recurring', 'vendors']) {
          const items = await DB.byIndex(store, 'ws', this._ws());
          for (const it of items) await DB.del(store, it.id);
        }
      }
      const remap = (arr) => (arr || []).map((x) => ({ ...x, ws: this._ws() }));
      await DB.putMany('categories', remap(d.categories));
      await DB.putMany('accounts', remap(d.accounts));
      await DB.putMany('transactions', remap(d.transactions));
      await DB.putMany('budgets', remap(d.budgets));
      await DB.putMany('recurring', remap(d.recurring));
      await DB.putMany('vendors', remap(d.vendors));
    },

    async wipeWorkspaceData() {
      for (const store of ['transactions', 'budgets', 'recurring']) {
        const items = await DB.byIndex(store, 'ws', this._ws());
        for (const it of items) await DB.del(store, it.id);
      }
    },
  };

  function advance(dateKey, freq) {
    const d = L.parseDate(dateKey);
    if (freq === 'daily') d.setDate(d.getDate() + 1);
    else if (freq === 'weekly') d.setDate(d.getDate() + 7);
    else if (freq === 'biweekly') d.setDate(d.getDate() + 14);
    else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
    else if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1); // monthly
    return L.dateKey(d);
  }

  L.Store = Store;
})();
