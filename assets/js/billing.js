/* ============================================================
   Ledgerly — billing.js
   Subscription plans, entitlements (feature gating + limits),
   a mock payment processor, invoices and the full subscription
   lifecycle. Designed so a real gateway (Stripe) drops in at
   PaymentProcessor.charge() without touching the rest.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const DB = L.DB;

  const DAY = 86400000;
  const TRIAL_DAYS = 14;

  /* ---------- Plan catalogue ---------- */
  const ALL_FEATURES = [
    'recurring', 'budgets', 'taxReports', 'multiCurrency',
    'multiWorkspace', 'team', 'vendorAnalytics', 'scheduledExports', 'prioritySupport',
  ];
  const FEATURE_LABELS = {
    recurring: 'Recurring automation', budgets: 'Budgets & alerts', taxReports: 'Tax & deductible reports',
    multiCurrency: 'Multi-currency', multiWorkspace: 'Multiple workspaces', team: 'Team members & roles',
    vendorAnalytics: 'Advanced vendor analytics', scheduledExports: 'Scheduled report exports',
    prioritySupport: 'Priority support',
  };

  const PLANS = {
    starter: {
      id: 'starter', name: 'Starter', color: '#64748B',
      tagline: 'For freelancers getting organized.',
      priceMonthly: 0, priceAnnual: 0,
      limits: { workspaces: 1, seats: 1 },
      features: [],
    },
    pro: {
      id: 'pro', name: 'Pro', color: '#FF385C',
      tagline: 'For growing businesses that want it all.',
      priceMonthly: 9, priceAnnual: 84,
      limits: { workspaces: 3, seats: 1 },
      features: ['recurring', 'budgets', 'taxReports', 'multiCurrency', 'multiWorkspace', 'prioritySupport'],
    },
    business: {
      id: 'business', name: 'Business', color: '#7C3AED',
      tagline: 'For teams managing serious money.',
      priceMonthly: 29, priceAnnual: 276,
      limits: { workspaces: Infinity, seats: 25 },
      features: ALL_FEATURES.slice(),
    },
  };
  const PLAN_ORDER = ['starter', 'pro', 'business'];

  function planPrice(planId, cycle) {
    const p = PLANS[planId]; if (!p) return 0;
    return cycle === 'annual' ? p.priceAnnual : p.priceMonthly;
  }
  function monthlyEquivalent(planId, cycle) {
    const p = PLANS[planId]; if (!p) return 0;
    return cycle === 'annual' ? p.priceAnnual / 12 : p.priceMonthly;
  }

  /* ============================================================
     Payment processor (MOCK)
     Swap the body of charge() for a real gateway call later.
     Test cards:
       4242 4242 4242 4242  → always succeeds
       4000 0000 0000 0002  → always declined
     ============================================================ */
  const PaymentProcessor = {
    luhn(num) {
      const s = String(num).replace(/\s+/g, '');
      if (!/^\d{12,19}$/.test(s)) return false;
      let sum = 0, alt = false;
      for (let i = s.length - 1; i >= 0; i--) {
        let d = +s[i];
        if (alt) { d *= 2; if (d > 9) d -= 9; }
        sum += d; alt = !alt;
      }
      return sum % 10 === 0;
    },
    brand(num) {
      const s = String(num).replace(/\s+/g, '');
      if (/^4/.test(s)) return 'Visa';
      if (/^5[1-5]/.test(s)) return 'Mastercard';
      if (/^3[47]/.test(s)) return 'Amex';
      if (/^6/.test(s)) return 'Discover';
      return 'Card';
    },
    // Returns a promise resolving to a charge result, or rejecting with an error.
    charge({ number, exp, cvc, amount, currency }) {
      return new Promise((resolve, reject) => {
        const s = String(number || '').replace(/\s+/g, '');
        setTimeout(() => {
          if (!this.luhn(s)) return reject(new Error('Your card number is invalid.'));
          if (!/^\d{2}\s*\/\s*\d{2}$/.test(exp || '')) return reject(new Error('Enter a valid expiry (MM / YY).'));
          if (!/^\d{3,4}$/.test(cvc || '')) return reject(new Error('Enter a valid CVC.'));
          if (s === '4000000000000002') return reject(new Error('Your card was declined.'));
          resolve({
            chargeId: 'ch_' + L.uid(), brand: this.brand(s), last4: s.slice(-4),
            amount, currency, status: 'succeeded', at: Date.now(),
          });
        }, 900);
      });
    },
  };

  /* ============================================================
     Billing service
     ============================================================ */
  const Billing = {
    PLANS, PLAN_ORDER, ALL_FEATURES, FEATURE_LABELS, TRIAL_DAYS,
    planPrice, monthlyEquivalent, PaymentProcessor,

    // Apply platform-admin plan overrides (price/limits/features) from meta.
    async loadOverrides() {
      const meta = await DB.get('meta', 'planConfig').catch(() => null);
      if (!meta || !meta.plans) return;
      for (const pid in meta.plans) {
        const cfg = meta.plans[pid], p = PLANS[pid];
        if (!p) continue;
        if (cfg.priceMonthly != null) p.priceMonthly = cfg.priceMonthly;
        if (cfg.priceAnnual != null) p.priceAnnual = cfg.priceAnnual;
        if (cfg.limits) p.limits = cfg.limits;
        if (cfg.features) p.features = cfg.features;
      }
    },

    async _invoiceNumber() {
      const m = (await DB.get('meta', 'invoiceSeq')) || { key: 'invoiceSeq', n: 1000 };
      m.n += 1;
      await DB.put('meta', m);
      return 'LG-' + m.n;
    },

    async getSubscription(userId) {
      const subs = await DB.byIndex('subscriptions', 'userId', userId);
      return subs[0] || null;
    },

    // Create the initial trial subscription for a new user.
    async startTrial(userId) {
      const now = Date.now();
      const sub = {
        id: L.uid('sub'), userId, planId: 'pro', trialPlanId: 'pro',
        status: 'trialing', billingCycle: 'monthly',
        currentPeriodStart: now, currentPeriodEnd: now + TRIAL_DAYS * DAY,
        trialEnd: now + TRIAL_DAYS * DAY, cancelAtPeriodEnd: false,
        seats: 1, createdAt: now, comp: false,
      };
      await DB.put('subscriptions', sub);
      return sub;
    },

    async ensureSubscription(userId) {
      let sub = await this.getSubscription(userId);
      if (!sub) sub = await this.startTrial(userId);
      return sub;
    },

    // Effective plan considering trial expiry & cancellation.
    effectivePlanId(sub) {
      if (!sub) return 'starter';
      const now = Date.now();
      if (sub.status === 'trialing') return now < sub.trialEnd ? sub.trialPlanId : 'starter';
      if (sub.status === 'active') return sub.planId;
      if (sub.status === 'past_due') return sub.planId; // grace period
      if (sub.status === 'canceled') return now < sub.currentPeriodEnd ? sub.planId : 'starter';
      return 'starter';
    },

    statusLabel(sub) {
      if (!sub) return 'No subscription';
      const now = Date.now();
      if (sub.status === 'trialing') {
        const days = Math.max(0, Math.ceil((sub.trialEnd - now) / DAY));
        return days > 0 ? `Pro trial · ${days} day${days === 1 ? '' : 's'} left` : 'Trial expired';
      }
      if (sub.status === 'active') return sub.cancelAtPeriodEnd ? 'Active · cancels at period end' : 'Active';
      if (sub.status === 'past_due') return 'Payment past due';
      if (sub.status === 'canceled') return now < sub.currentPeriodEnd ? 'Canceled · access until period end' : 'Canceled';
      return sub.status;
    },

    async entitlements(userId) {
      const sub = await this.ensureSubscription(userId);
      const planId = this.effectivePlanId(sub);
      const plan = PLANS[planId] || PLANS.starter;
      return {
        sub, planId, plan,
        limits: plan.limits,
        can: (f) => plan.features.indexOf(f) >= 0,
      };
    },

    /* ---------- Lifecycle ---------- */
    async createInvoice(userId, sub, { planId, cycle, amount, charge, kind, description }) {
      const inv = {
        id: L.uid('inv'), userId, subscriptionId: sub.id,
        number: await this._invoiceNumber(),
        planId, cycle, amount, currency: 'USD',
        status: amount > 0 ? 'paid' : 'paid',
        kind: kind || 'subscription',
        description: description || (PLANS[planId].name + ' plan — ' + (cycle === 'annual' ? 'annual' : 'monthly')),
        card: charge ? { brand: charge.brand, last4: charge.last4 } : null,
        createdAt: Date.now(), paidAt: amount >= 0 ? Date.now() : null,
      };
      await DB.put('invoices', inv);
      return inv;
    },

    async invoices(userId) {
      const list = await DB.byIndex('invoices', 'userId', userId);
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },

    async paymentMethods(userId) {
      return DB.byIndex('paymentMethods', 'userId', userId);
    },
    async savePaymentMethod(userId, charge, makeDefault) {
      const existing = await this.paymentMethods(userId);
      if (makeDefault) for (const m of existing) { if (m.isDefault) { m.isDefault = false; await DB.put('paymentMethods', m); } }
      const pm = {
        id: L.uid('pm'), userId, brand: charge.brand, last4: charge.last4,
        exp: charge.exp || '', isDefault: makeDefault || existing.length === 0, createdAt: Date.now(),
      };
      await DB.put('paymentMethods', pm);
      return pm;
    },
    async removePaymentMethod(id) { await DB.del('paymentMethods', id); },

    // Subscribe / upgrade / change plan with a card charge (via processor).
    async subscribe(userId, { planId, cycle, card }) {
      const sub = await this.ensureSubscription(userId);
      const amount = planPrice(planId, cycle);
      let charge = null;
      if (amount > 0) {
        charge = await PaymentProcessor.charge({ number: card.number, exp: card.exp, cvc: card.cvc, amount, currency: 'USD' });
        charge.exp = card.exp;
        await this.savePaymentMethod(userId, charge, true);
      }
      const now = Date.now();
      const periodLen = cycle === 'annual' ? 365 * DAY : 30 * DAY;
      sub.planId = planId;
      sub.billingCycle = cycle;
      sub.status = planId === 'starter' ? 'active' : 'active';
      sub.currentPeriodStart = now;
      sub.currentPeriodEnd = now + periodLen;
      sub.cancelAtPeriodEnd = false;
      sub.comp = false;
      sub.updatedAt = now;
      await DB.put('subscriptions', sub);
      let invoice = null;
      if (amount > 0) invoice = await this.createInvoice(userId, sub, { planId, cycle, amount, charge });
      // reflect plan on user record for quick reads
      await this._syncUserPlan(userId, planId);
      return { subscription: sub, invoice };
    },

    async downgradeToStarter(userId) {
      const sub = await this.ensureSubscription(userId);
      sub.planId = 'starter'; sub.status = 'active'; sub.cancelAtPeriodEnd = false;
      sub.billingCycle = 'monthly';
      sub.currentPeriodEnd = Date.now() + 30 * DAY;
      await DB.put('subscriptions', sub);
      await this._syncUserPlan(userId, 'starter');
      return sub;
    },

    async cancel(userId) {
      const sub = await this.ensureSubscription(userId);
      sub.cancelAtPeriodEnd = true; sub.status = 'canceled';
      await DB.put('subscriptions', sub);
      return sub;
    },
    async resume(userId) {
      const sub = await this.ensureSubscription(userId);
      sub.cancelAtPeriodEnd = false; sub.status = 'active';
      await DB.put('subscriptions', sub);
      return sub;
    },

    async _syncUserPlan(userId, planId) {
      const u = await DB.get('users', userId);
      if (u) { u.plan = planId; await DB.put('users', u); }
    },

    /* ---------- Admin operations ---------- */
    async adminSetPlan(userId, planId, { comp } = {}) {
      const sub = await this.ensureSubscription(userId);
      const now = Date.now();
      sub.planId = planId;
      sub.status = 'active';
      sub.cancelAtPeriodEnd = false;
      sub.comp = !!comp;
      sub.currentPeriodStart = now;
      sub.currentPeriodEnd = now + 30 * DAY;
      await DB.put('subscriptions', sub);
      await this._syncUserPlan(userId, planId);
      return sub;
    },
    async adminExtendTrial(userId, days) {
      const sub = await this.ensureSubscription(userId);
      const base = Math.max(Date.now(), sub.trialEnd || Date.now());
      sub.trialEnd = base + days * DAY;
      sub.currentPeriodEnd = sub.trialEnd;
      if (sub.status !== 'active') sub.status = 'trialing';
      await DB.put('subscriptions', sub);
      return sub;
    },
    async adminRefundInvoice(invoiceId) {
      const inv = await DB.get('invoices', invoiceId);
      if (!inv) throw new Error('Invoice not found');
      inv.status = 'refunded'; inv.refundedAt = Date.now();
      await DB.put('invoices', inv);
      return inv;
    },
  };

  L.Billing = Billing;
})();
