/* ============================================================
   Ledgerly — icons.js
   Lightweight inline SVG line-icon set (Lucide-style, 24x24,
   stroke = currentColor). Replaces emoji throughout the UI for
   a clean, professional business look.
   Usage:
     L.icon('receipt')             -> SVG string
     L.icon('receipt',{size:18})   -> sized SVG string
     L.iconEl('receipt')           -> SVG DOM node
     L.catIcon(cat)                -> HTML string for a category glyph
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});

  const P = {
    dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    receipt: '<path d="M5 3v18l2-1.2L9 21l2-1.2L13 21l2-1.2L17 21l2-1.2V3l-2 1.2L15 3l-2 1.2L11 3 9 4.2 7 3Z"/><path d="M8.5 8h7"/><path d="M8.5 12h7"/><path d="M8.5 16h4"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="2.8" height="7" rx="0.6"/><rect x="12" y="7" width="2.8" height="11" rx="0.6"/><rect x="17" y="14" width="2.8" height="4" rx="0.6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.7"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    repeat: '<path d="m17 2 3.5 3.5L17 9"/><path d="M3.5 11v-1A4.5 4.5 0 0 1 8 5.5h12.5"/><path d="m7 22-3.5-3.5L7 15"/><path d="M20.5 13v1a4.5 4.5 0 0 1-4.5 4.5H3.5"/>',
    wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v.5"/><rect x="3" y="7" width="18" height="12.5" rx="2.5"/><path d="M16.5 13.2h.02"/>',
    tag: '<path d="M11.5 3H4a1 1 0 0 0-1 1v7.5a1 1 0 0 0 .3.7l8.8 8.8a1.5 1.5 0 0 0 2.1 0l6.9-6.9a1.5 1.5 0 0 0 0-2.1L12.2 3.3a1 1 0 0 0-.7-.3Z"/><circle cx="7.3" cy="7.3" r="1.4"/>',
    users: '<path d="M15.5 20v-1.8a3.8 3.8 0 0 0-3.8-3.8H6.3a3.8 3.8 0 0 0-3.8 3.8V20"/><circle cx="9" cy="7.2" r="3.8"/><path d="M21.5 20v-1.8a3.8 3.8 0 0 0-2.9-3.7"/><path d="M15.5 3.7a3.8 3.8 0 0 1 0 7.1"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-3.6-3.6"/>',
    download: '<path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 20.5h15"/>',
    printer: '<path d="M6.5 9V3.5h11V9"/><rect x="6.5" y="13.5" width="11" height="7"/><path d="M6.5 17.5H4a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 4 10.5h16a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-2.5"/>',
    filter: '<path d="M4 4h16l-6.2 7.3v6L10.2 19v-7.7Z"/>',
    chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
    chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6.5 9.5 17 4.5 12"/>',
    trendingUp: '<path d="m3.5 16.5 6-6 4 4 7-7"/><path d="M16.5 7.5h4v4"/>',
    trendingDown: '<path d="m3.5 7.5 6 6 4-4 7 7"/><path d="M16.5 16.5h4v-4"/>',
    trash: '<path d="M3.5 6.5h17"/><path d="M8.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v1.5"/><path d="M6.5 6.5V20a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5"/><path d="M10 11v6M14 11v6"/>',
    edit: '<path d="M12 20.5h8.5"/><path d="M16.5 3.5a2 2 0 0 1 2.8 2.8L7 18.6l-3.5 1 1-3.5Z"/>',
    menu: '<path d="M3.5 6.5h17"/><path d="M3.5 12h17"/><path d="M3.5 17.5h17"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20.5 14.5A8.2 8.2 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>',
    logout: '<path d="M9.5 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3h4"/><path d="m16 16.5 4.5-4.5L16 7.5"/><path d="M20.5 12h-11"/>',
    calendar: '<rect x="3.5" y="4.5" width="17" height="16.5" rx="2"/><path d="M16 3v3.5M8 3v3.5M3.5 10h17"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9.5 21v-4h5v4"/><path d="M9 7h.5M14.5 7h.5M9 11h.5M14.5 11h.5"/>',
    user: '<circle cx="12" cy="8" r="4.2"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    shield: '<path d="M12 3 5 5.5v6c0 4.5 3 7.4 7 8.5 4-1.1 7-4 7-8.5v-6Z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    briefcase: '<rect x="2.5" y="7.5" width="19" height="13" rx="2"/><path d="M8 7.5V5.5A2 2 0 0 1 10 3.5h4a2 2 0 0 1 2 2v2"/><path d="M2.5 13h19"/>',
    monitor: '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8.5 20.5h7"/><path d="M12 16.5v4"/>',
    plane: '<path d="M10.2 4.2a1.4 1.4 0 0 1 2.4-.4l2.1 2.9 4.6-1.3a1 1 0 0 1 1 1.6L17 9.7l1.2 6.6a.9.9 0 0 1-1.5.8l-2.9-3.4-3 1.9.2 2.4a.7.7 0 0 1-1.2.5l-1.5-2-2-1.5a.7.7 0 0 1 .5-1.2l2.4.2 1.9-3-3.4-2.9a.9.9 0 0 1 .8-1.5l6.6 1.2Z"/>',
    utensils: '<path d="M4 3v6a2.5 2.5 0 0 0 5 0V3"/><path d="M6.5 9v12"/><path d="M17.5 3c-1.7 0-3 2.2-3 5s1 4.2 3 4.2V21"/>',
    megaphone: '<path d="m20.5 6-13 4v4l13 4V6Z"/><path d="M7.5 10H5a2 2 0 0 0 0 4h2.5"/><path d="M9 14.4V18a1 1 0 0 0 1 1h1"/>',
    scale: '<path d="M12 3.5v17"/><path d="M7 20.5h10"/><path d="m5 6.5 14-2"/><path d="M6 6.5 3 13a3 3 0 0 0 6 0Z"/><path d="M18 4.7 15 12a3 3 0 0 0 6 0Z"/>',
    fuel: '<path d="M3.5 21V5A1.5 1.5 0 0 1 5 3.5h6A1.5 1.5 0 0 1 12.5 5v16"/><path d="M2.5 21h11"/><path d="M4 9.5h7"/><path d="M15.5 8.5 18 11v6.5a1.5 1.5 0 0 0 3 0V10l-2.5-2.5"/>',
    landmark: '<path d="M3.5 21h17"/><path d="M5.5 21v-9M18.5 21v-9M9.5 21v-9M14.5 21v-9"/><path d="m3.5 9.5 8.5-6 8.5 6Z"/>',
    box: '<path d="M20.5 8 12 3.5 3.5 8v8L12 20.5 20.5 16Z"/><path d="m3.5 8 8.5 4.5L20.5 8"/><path d="M12 20.5v-8"/>',
    dollar: '<path d="M12 2.5v19"/><path d="M16.5 6.2A4 4 0 0 0 13 4.5H9.8a3.3 3.3 0 0 0 0 6.6h4.4a3.3 3.3 0 0 1 0 6.6H10a4 4 0 0 1-3.5-1.7"/>',
    coffee: '<path d="M16.5 8.5H18a3.5 3.5 0 0 1 0 7h-1.5"/><path d="M3.5 8.5h13v8a4 4 0 0 1-4 4H7.5a4 4 0 0 1-4-4Z"/><path d="M6.5 2.5v2M10 2.5v2M13.5 2.5v2"/>',
    plusCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>',
    bank: '<rect x="3" y="8.5" width="18" height="11.5" rx="1.5"/><path d="M3 8.5 12 3.5l9 5"/><path d="M7.5 12.5v3.5M12 12.5v3.5M16.5 12.5v3.5"/>',
    zap: '<path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12Z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/>',
    camera: '<path d="M4 7.5h3l1.5-2h7L18 7.5h2a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z"/><circle cx="12" cy="13" r="3.5"/>',
    inbox: '<path d="M21 12.5H16l-1.5 2.5h-5L8 12.5H3"/><path d="M5.5 6 3 12.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-5.5L18.5 6a1.5 1.5 0 0 0-1.4-1H6.9A1.5 1.5 0 0 0 5.5 6Z"/>',
    arrowRight: '<path d="M4.5 12h15"/><path d="m13 5.5 6.5 6.5-6.5 6.5"/>',
    file: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z"/><path d="M13.5 3.5v5h5"/>',
    handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m13 15 2.5 2.5a1.4 1.4 0 0 0 2-2L14 12"/><path d="M3 11.5 7 7.5l4 3 2-1.5 5 5"/><path d="m3 11.5 3 3M18 13.5l3-3-4-4-2 1"/>',
    percent: '<path d="m19 5-14 14"/><circle cx="7.5" cy="7.5" r="2.2"/><circle cx="16.5" cy="16.5" r="2.2"/>',
    alert: '<path d="M12 3.5 2.5 20.5h19Z"/><path d="M12 9.5v4.5"/><path d="M12 17.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5"/><path d="M12 8.5V21"/><path d="M12 8.5S10.5 4 8 4a2.2 2.2 0 0 0 0 4.5Z"/><path d="M12 8.5S13.5 4 16 4a2.2 2.2 0 0 1 0 4.5Z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11.5v5"/><path d="M12 8h.01"/>',
    upload: '<path d="M12 15V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M4.5 20.5h15"/>',
    arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    logoBars: '<rect x="4" y="12" width="3.4" height="8" rx="1"/><rect x="10.3" y="7" width="3.4" height="13" rx="1"/><rect x="16.6" y="9.5" width="3.4" height="10.5" rx="1"/>',
  };

  // Legacy emoji -> icon name (so pre-existing data renders cleanly too).
  const EMOJI = {
    '🗂️': 'briefcase', '💻': 'monitor', '✈️': 'plane', '🍽️': 'utensils', '📣': 'megaphone',
    '🏢': 'building', '👥': 'users', '⚖️': 'scale', '🖥️': 'monitor', '🛡️': 'shield',
    '⛽': 'fuel', '🏦': 'landmark', '🧾': 'receipt', '📦': 'box', '💰': 'dollar',
    '🤝': 'handshake', '➕': 'plusCircle', '☕': 'coffee', '🚕': 'plane', '🏨': 'building',
    '💳': 'card', '💵': 'dollar', '🐷': 'wallet', '📲': 'wallet', '📱': 'monitor',
    '🎓': 'briefcase', '🛒': 'box', '💡': 'zap', '🔧': 'settings', '📸': 'camera',
    '🎨': 'edit', '🩺': 'shield', '🏋️': 'target', '🐾': 'box', '🎁': 'box',
    '📚': 'file', '🍔': 'utensils', '🚗': 'fuel', '✏️': 'edit', '🔌': 'zap', '📁': 'tag',
  };

  L.ICON_NAMES = Object.keys(P);
  L.EMOJI_ICON = EMOJI;

  L.icon = function (name, opts) {
    opts = opts || {};
    const size = opts.size || 20;
    const sw = opts.stroke || 1.7;
    const body = P[name] || P.box;
    return `<svg class="ic-svg${opts.cls ? ' ' + opts.cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  };

  L.iconEl = function (name, opts) {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';
    wrap.innerHTML = L.icon(name, opts);
    return wrap.firstChild;
  };

  // Resolve a category's stored glyph to an icon name (handles legacy emoji).
  L.resolveIcon = function (glyph) {
    if (!glyph) return 'tag';
    if (P[glyph]) return glyph;
    if (EMOJI[glyph]) return EMOJI[glyph];
    return null; // unknown (custom emoji) -> render as text
  };

  // HTML for a category glyph inside a tile (SVG when known, else the raw char).
  L.catGlyph = function (glyph, size) {
    const name = L.resolveIcon(glyph);
    if (name) return L.icon(name, { size: size || 18 });
    return `<span style="font-size:${(size || 18) - 1}px;line-height:1">${glyph}</span>`;
  };
})();
