/* ============================================================
   Ledgerly — util.js
   Shared helpers: ids, dates, currency, formatting, DOM.
   No dependencies. Attaches to window.L (Ledgerly namespace).
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});

  /* ---------- IDs ---------- */
  L.uid = function (prefix) {
    const r = crypto.getRandomValues(new Uint32Array(2));
    return (prefix ? prefix + '_' : '') + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36);
  };

  /* ---------- Currency registry ---------- */
  L.CURRENCIES = {
    USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
    EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
    GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
    CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', decimals: 2 },
    AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
    INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
    JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
    CNY: { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan', decimals: 2 },
    CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
    SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
    AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', decimals: 2 },
    MXN: { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', decimals: 2 },
    BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
    ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2 },
    NZD: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2 },
  };

  // Illustrative static rates relative to USD (for multi-currency normalization).
  // In production these would be fetched from an FX API.
  L.FX_TO_USD = {
    USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.66, INR: 0.012, JPY: 0.0067,
    CNY: 0.14, CHF: 1.12, SGD: 0.74, AED: 0.27, MXN: 0.058, BRL: 0.19, ZAR: 0.055, NZD: 0.60,
  };

  L.convert = function (amount, from, to) {
    if (from === to) return amount;
    const usd = amount * (L.FX_TO_USD[from] || 1);
    return usd / (L.FX_TO_USD[to] || 1);
  };

  L.money = function (amount, code, opts) {
    opts = opts || {};
    const c = L.CURRENCIES[code] || L.CURRENCIES.USD;
    const decimals = opts.decimals != null ? opts.decimals : c.decimals;
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    const num = abs.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return sign + c.symbol + num;
  };

  L.moneyShort = function (amount, code) {
    const c = L.CURRENCIES[code] || L.CURRENCIES.USD;
    const abs = Math.abs(amount);
    let str;
    if (abs >= 1e9) str = (amount / 1e9).toFixed(1) + 'B';
    else if (abs >= 1e6) str = (amount / 1e6).toFixed(1) + 'M';
    else if (abs >= 1e3) str = (amount / 1e3).toFixed(1) + 'K';
    else str = Math.round(amount).toString();
    return c.symbol + str.replace('.0', '');
  };

  /* ---------- Dates ---------- */
  L.today = function () {
    const d = new Date();
    return L.dateKey(d);
  };
  L.dateKey = function (d) {
    d = new Date(d);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  L.parseDate = function (key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  L.fmtDate = function (key, style) {
    const d = L.parseDate(key);
    if (style === 'long') return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    if (style === 'day') return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  L.relDate = function (key) {
    const d = L.parseDate(key);
    const now = new Date();
    const days = Math.round((L.parseDate(L.today()) - d) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days === -1) return 'Tomorrow';
    if (days > 1 && days < 7) return days + ' days ago';
    return L.fmtDate(key);
  };
  L.monthKey = function (key) { return key.slice(0, 7); };
  L.monthLabel = function (mkey) {
    const [y, m] = mkey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  };
  L.monthLabelLong = function (mkey) {
    const [y, m] = mkey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };
  L.addMonths = function (key, n) {
    const d = L.parseDate(key);
    d.setMonth(d.getMonth() + n);
    return L.dateKey(d);
  };
  L.startOfMonth = function (d) { d = new Date(d); return L.dateKey(new Date(d.getFullYear(), d.getMonth(), 1)); };
  L.endOfMonth = function (d) { d = new Date(d); return L.dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  L.daysBetween = function (a, b) { return Math.round((L.parseDate(b) - L.parseDate(a)) / 86400000); };

  /* Range presets */
  L.rangePreset = function (name) {
    const now = new Date();
    const t = L.today();
    switch (name) {
      case 'this-month': return { from: L.startOfMonth(now), to: L.endOfMonth(now), label: 'This month' };
      case 'last-month': {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { from: L.startOfMonth(lm), to: L.endOfMonth(lm), label: 'Last month' };
      }
      case 'last-30': return { from: L.dateKey(new Date(Date.now() - 29 * 86400000)), to: t, label: 'Last 30 days' };
      case 'last-90': return { from: L.dateKey(new Date(Date.now() - 89 * 86400000)), to: t, label: 'Last 90 days' };
      case 'ytd': return { from: L.dateKey(new Date(now.getFullYear(), 0, 1)), to: t, label: 'Year to date' };
      case 'last-year': return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31`, label: 'Last year' };
      case 'all': return { from: '1970-01-01', to: '2999-12-31', label: 'All time' };
      default: return { from: L.startOfMonth(now), to: L.endOfMonth(now), label: 'This month' };
    }
  };

  /* ---------- Strings / misc ---------- */
  L.escape = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  L.titleCase = function (s) { return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()); };
  L.initials = function (name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  };
  L.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  L.sum = function (arr, f) { return arr.reduce((a, x) => a + (f ? f(x) : x), 0); };
  L.groupBy = function (arr, keyFn) {
    const m = new Map();
    for (const x of arr) {
      const k = keyFn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  L.debounce = function (fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };

  /* ---------- DOM ---------- */
  L.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  };
  L.$ = (sel, root) => (root || document).querySelector(sel);
  L.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- Toast ---------- */
  L.toast = function (msg, kind) {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) {
      wrap = L.el('div', { id: 'toastWrap', class: 'toast-wrap' });
      document.body.appendChild(wrap);
    }
    const t = L.el('div', { class: 'toast toast--' + (kind || 'info') });
    t.innerHTML = `<span class="toast__dot"></span><span>${L.escape(msg)}</span>`;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    setTimeout(() => {
      t.classList.remove('is-in');
      setTimeout(() => t.remove(), 300);
    }, 3200);
  };

  /* ---------- CSV ---------- */
  L.toCSV = function (rows, headers) {
    const esc = (v) => {
      v = v == null ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [];
    if (headers) lines.push(headers.map(esc).join(','));
    for (const r of rows) lines.push(r.map(esc).join(','));
    return lines.join('\n');
  };
  L.parseCSV = function (text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c !== ''));
  };
  L.download = function (filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = L.el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  };

  /* ---------- Simple hashing for demo auth (NOT for production secrets) ---------- */
  L.hash = async function (str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
})();
