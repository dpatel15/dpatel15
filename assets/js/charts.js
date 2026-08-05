/* ============================================================
   Ledgerly — charts.js
   Dependency-free SVG charts: donut, grouped bars, area/line.
   Every chart returns an SVG element and is theme-aware via
   currentColor + CSS variables.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const NS = 'http://www.w3.org/2000/svg';

  function svg(w, h) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.setAttribute('width', '100%');
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    s.setAttribute('class', 'chart');
    s.setAttribute('role', 'img');
    return s;
  }
  function node(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function polar(cx, cy, r, angle) {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }
  function arcPath(cx, cy, rOuter, rInner, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = polar(cx, cy, rOuter, a0);
    const [x1, y1] = polar(cx, cy, rOuter, a1);
    const [x2, y2] = polar(cx, cy, rInner, a1);
    const [x3, y3] = polar(cx, cy, rInner, a0);
    return [
      `M ${x0} ${y0}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3}`,
      'Z',
    ].join(' ');
  }

  const Charts = {
    /* ---------- Donut ---------- */
    donut(data, opts) {
      opts = opts || {};
      const size = 220, cx = size / 2, cy = size / 2;
      const rOuter = 100, rInner = 66;
      const s = svg(size, size);
      const total = L.sum(data, (d) => d.value) || 1;
      let a = -Math.PI / 2;
      const gap = data.length > 1 ? 0.03 : 0;
      data.forEach((d, i) => {
        const frac = d.value / total;
        const a1 = a + frac * Math.PI * 2;
        const p = node('path', {
          d: arcPath(cx, cy, rOuter, rInner, a + gap / 2, Math.max(a + gap / 2, a1 - gap / 2)),
          fill: d.color, class: 'donut__seg',
        });
        p.style.setProperty('--i', i);
        if (opts.onHover) {
          p.addEventListener('mouseenter', () => opts.onHover(d, p));
          p.addEventListener('mouseleave', () => opts.onHover(null, p));
        }
        const t = node('title', {});
        t.textContent = `${d.label}: ${opts.fmt ? opts.fmt(d.value) : d.value}`;
        p.appendChild(t);
        s.appendChild(p);
        a = a1;
      });
      // center label
      const center = node('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'donut__center' });
      center.textContent = opts.centerTop || '';
      const center2 = node('text', { x: cx, y: cy + 18, 'text-anchor': 'middle', class: 'donut__sub' });
      center2.textContent = opts.centerBottom || '';
      s.appendChild(center); s.appendChild(center2);
      return s;
    },

    /* ---------- Grouped bars (income vs expense by month) ---------- */
    bars(series, opts) {
      opts = opts || {};
      const W = 640, H = 260, padL = 8, padR = 8, padT = 18, padB = 34;
      const s = svg(W, H);
      const max = Math.max(1, ...series.map((d) => Math.max(d.income || 0, d.expense || 0)));
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const groupW = plotW / series.length;
      const barW = Math.min(26, groupW * 0.32);
      // gridlines
      for (let g = 0; g <= 4; g++) {
        const y = padT + (plotH * g) / 4;
        s.appendChild(node('line', { x1: padL, y1: y, x2: W - padR, y2: y, class: 'grid' }));
        const lbl = node('text', { x: padL, y: y - 4, class: 'axis' });
        lbl.textContent = L.moneyShort(max * (1 - g / 4), opts.currency || 'USD');
        s.appendChild(lbl);
      }
      series.forEach((d, i) => {
        const gx = padL + groupW * i + groupW / 2;
        const inc = d.income || 0, exp = d.expense || 0;
        const hInc = (inc / max) * plotH, hExp = (exp / max) * plotH;
        const rIncome = node('rect', {
          x: gx - barW - 2, y: padT + plotH - hInc, width: barW, height: Math.max(0, hInc),
          rx: 5, class: 'bar bar--income',
        });
        const rExpense = node('rect', {
          x: gx + 2, y: padT + plotH - hExp, width: barW, height: Math.max(0, hExp),
          rx: 5, class: 'bar bar--expense',
        });
        rIncome.style.setProperty('--i', i); rExpense.style.setProperty('--i', i);
        const ti = node('title', {}); ti.textContent = `Income: ${L.money(inc, opts.currency)}`; rIncome.appendChild(ti);
        const te = node('title', {}); te.textContent = `Expense: ${L.money(exp, opts.currency)}`; rExpense.appendChild(te);
        s.appendChild(rIncome); s.appendChild(rExpense);
        const lbl = node('text', { x: gx, y: H - 12, 'text-anchor': 'middle', class: 'axis axis--x' });
        lbl.textContent = L.monthLabel(d.month);
        s.appendChild(lbl);
      });
      return s;
    },

    /* ---------- Area / line (daily spend trend) ---------- */
    area(points, opts) {
      opts = opts || {};
      const W = 640, H = 220, padL = 6, padR = 6, padT = 14, padB = 24;
      const s = svg(W, H);
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const max = Math.max(1, ...points.map((p) => p.value));
      const n = points.length;
      const x = (i) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
      const y = (v) => padT + plotH - (v / max) * plotH;
      // grid
      for (let g = 0; g <= 3; g++) {
        const gy = padT + (plotH * g) / 3;
        s.appendChild(node('line', { x1: padL, y1: gy, x2: W - padR, y2: gy, class: 'grid' }));
      }
      // smooth-ish path
      let dLine = '';
      points.forEach((p, i) => { dLine += (i === 0 ? 'M' : 'L') + ` ${x(i)} ${y(p.value)} `; });
      const dArea = dLine + ` L ${x(n - 1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z`;
      // gradient
      const gid = 'grad_' + Math.random().toString(36).slice(2, 7);
      const defs = node('defs', {});
      const lg = node('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.appendChild(node('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': 0.28 }));
      lg.appendChild(node('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': 0 }));
      defs.appendChild(lg); s.appendChild(defs);
      s.appendChild(node('path', { d: dArea, fill: `url(#${gid})`, class: 'area__fill' }));
      s.appendChild(node('path', { d: dLine, fill: 'none', class: 'area__line' }));
      // x labels (first / mid / last)
      [0, Math.floor(n / 2), n - 1].forEach((i, k) => {
        if (i < 0 || i >= n) return;
        const lbl = node('text', { x: x(i), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle', class: 'axis axis--x' });
        lbl.textContent = L.fmtDate(points[i].date);
        s.appendChild(lbl);
      });
      return s;
    },

    /* ---------- Sparkline ---------- */
    spark(values, opts) {
      opts = opts || {};
      const W = 120, H = 36;
      const s = svg(W, H);
      const max = Math.max(1, ...values), min = Math.min(0, ...values);
      const n = values.length;
      const x = (i) => (n <= 1 ? W / 2 : (W * i) / (n - 1));
      const y = (v) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
      let d = '';
      values.forEach((v, i) => { d += (i === 0 ? 'M' : 'L') + ` ${x(i)} ${y(v)} `; });
      s.appendChild(node('path', { d, fill: 'none', class: 'spark__line', stroke: opts.color || 'var(--accent)' }));
      return s;
    },
  };

  L.Charts = Charts;
})();
