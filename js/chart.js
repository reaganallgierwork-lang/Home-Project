/* ============================================================================
   CHART — one reusable time-series chart, drawn as SVG.
   ----------------------------------------------------------------------------
   Knows nothing about habits or metrics: hand it one or two series (already
   bucketed, already coloured, already told which axis to use) and it draws
   them. Any future data source gets the same chart for free.

   Design rules it follows (so it stays readable rather than merely colourful):
     • Up to TWO series. A third invites exactly the kind of cluttered,
       unreadable overlay this file exists to avoid — compare two things at
       once, or open a different metric, never three lines fighting for a
       phone-width plot.
     • A second series never inherits the first one's axis unless the two are
       genuinely on the same scale (same unit, values within a few times of
       each other). Otherwise it gets its own axis on the right, coloured to
       match its line — so a reader can never mistake "these two lines cross"
       for "these two values are equal", the exact invented-correlation trap
       a shared axis would set.
     • Thin marks, hairline solid gridlines, no dashes, lots of air.
     • Values are labelled SELECTIVELY — the last point of each series — not
       on every point, which nobody reads.
     • Gaps stay gaps. A day with no data breaks the line rather than being
       drawn as a zero that never happened.
     • Every value the chart shows is also in the Table view, so the tooltip
       enhances and never gates.
     • Colours are validated for contrast in both light and dark mode.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

const PLOT_H = 170;      // the drawing area
const AXIS_H = 24;       // the x-label band BELOW it — the container includes
const PAD_L = 42;        // room for the left y-axis numbers
const PAD_R = 12;        // widened below when a right axis is drawn
const PAD_R_DUAL = 40;
const PAD_T = 14;        // room for the top direct label

function svgEl(name, attrs = {}) {
  const n = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
}

/**
 * Round a max up to a clean number so the axis reads 0 / 75 / 150.
 * The ladder is deliberately fine-grained: a coarse one turns a 150oz goal
 * into a 200oz axis and throws away a quarter of the plot height.
 */
function niceMax(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => norm <= s + 1e-9) || 10;
  return step * mag;
}

/**
 * Draw into `host`.
 *
 * spec = {
 *   series: [{
 *     id, label, color, unit,           // 'unit' only used for the legend
 *     buckets: [{key,label,shortLabel,value,logged,total}],
 *     form: 'line' | 'bar',
 *     target: number|null,              // reference line — first series only
 *     targetLabel: string,
 *     format: (value) => string,
 *     axis: 'left' | 'right',           // which scale it's measured against
 *   }, ...],   // 1 or 2 entries, sharing the same bucket keys/length
 *   ariaLabel: string,
 *   onEmpty: string,
 * }
 */
export function renderChart(host, spec) {
  host.textContent = '';
  const all = (spec.series || []).filter((s) => s && s.buckets && s.buckets.length);
  const primary = all[0];
  const secondary = all[1] || null;

  if (!primary) {
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    empty.textContent = spec.onEmpty || 'Nothing logged in this window yet.';
    host.appendChild(empty);
    return;
  }

  const buckets = primary.buckets;
  const n = buckets.length;
  const withData = (s) => s.buckets.filter((b) => b.value !== null);
  const primaryHasData = withData(primary).length > 0;
  if (!primaryHasData && !(secondary && withData(secondary).length)) {
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    empty.textContent = spec.onEmpty || 'Nothing logged in this window yet.';
    host.appendChild(empty);
    return;
  }

  /* ---- legend, when there are two series to tell apart ---- */
  if (secondary) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    [primary, secondary].forEach((s) => {
      const item = document.createElement('span');
      item.className = 'chart-legend-item';
      item.innerHTML = `<i style="background:${s.color}"></i>${s.label}`;
      legend.appendChild(item);
    });
    host.appendChild(legend);
  }

  /* A pinned readout above the plot rather than a floating bubble — on a
     phone a floating tooltip gets clipped and fights the thumb. */
  const readout = document.createElement('div');
  readout.className = 'chart-readout';
  const rows = [primary, secondary].filter(Boolean).map((s) => {
    const row = document.createElement('div');
    row.className = 'chart-readout-row';
    const dot = document.createElement('i');
    dot.style.background = s.color;
    dot.style.display = secondary ? '' : 'none';
    const rVal = document.createElement('b');
    const rLab = document.createElement('span');
    row.append(dot, rVal, rLab);
    readout.appendChild(row);
    return { rVal, rLab };
  });
  host.appendChild(readout);

  const dualAxis = !!secondary && secondary.axis === 'right';
  const padR = dualAxis ? PAD_R_DUAL : PAD_R;
  const width = Math.max(240, host.clientWidth || 320);
  const innerW = width - PAD_L - padR;
  const totalH = PAD_T + PLOT_H + AXIS_H;

  const svg = svgEl('svg', {
    width: '100%', viewBox: `0 0 ${width} ${totalH}`, class: 'chart-svg',
    role: 'img', tabindex: '0',
    'aria-label': spec.ariaLabel || 'Trend chart',
  });

  const maxOf = (s) => Math.max(0, ...withData(s).map((b) => b.value));
  const leftTop = niceMax(Math.max(maxOf(primary), primary.target || 0, (!dualAxis && secondary ? maxOf(secondary) : 0)));
  const rightTop = dualAxis ? niceMax(maxOf(secondary)) : leftTop;
  const yLeft = (v) => PAD_T + PLOT_H - (v / leftTop) * PLOT_H;
  const yRight = (v) => PAD_T + PLOT_H - (v / rightTop) * PLOT_H;
  const yFor = (s) => (s === secondary && dualAxis ? yRight : yLeft);

  /* ---- gridlines + left y labels: solid hairlines, recessive ---- */
  [0, 0.5, 1].forEach((f) => {
    const val = leftTop * f;
    const yy = yLeft(val);
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: width - padR, y1: yy, y2: yy, class: 'chart-grid',
    }));
    const t = svgEl('text', {
      x: PAD_L - 7, y: yy + 3.5, class: 'chart-ytick', 'text-anchor': 'end',
      ...(dualAxis ? { style: `fill:${primary.color}` } : {}),
    });
    t.textContent = primary.format(val, { axis: true });
    svg.appendChild(t);
  });

  /* ---- the right axis, only when the second series can't share the left one --- */
  if (dualAxis) {
    [0, 0.5, 1].forEach((f) => {
      const val = rightTop * f;
      const yy = yRight(val);
      const t = svgEl('text', {
        x: width - padR + 7, y: yy + 3.5, class: 'chart-ytick', 'text-anchor': 'start', style: `fill:${secondary.color}`,
      });
      t.textContent = secondary.format(val, { axis: true });
      svg.appendChild(t);
    });
  }

  /* ---- the goal line, if the primary metric has one ---- */
  if (primary.target !== null && primary.target <= leftTop) {
    const ty = yLeft(primary.target);
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: width - padR, y1: ty, y2: ty, class: 'chart-target',
    }));
    const tl = svgEl('text', { x: PAD_L + 3, y: ty + 12, class: 'chart-target-label', 'text-anchor': 'start' });
    tl.textContent = primary.targetLabel || 'goal';
    svg.appendChild(tl);
  }

  const slot = innerW / n;
  const cx = (i) => PAD_L + slot * i + slot / 2;

  /* ---- draw one series: bars for the primary if asked, always a line for
     the secondary — overlaying two sets of bars on a phone-width plot reads
     as noise, a second line reads as a comparison. ---- */
  function drawSeries(s, asLine) {
    const y = yFor(s);
    const marks = [];
    if (s.form === 'bar' && !asLine) {
      const barW = Math.max(3, Math.min(24, slot - 2));
      s.buckets.forEach((b, i) => {
        if (b.value === null) { marks.push(null); return; }
        const h = Math.max(b.value > 0 ? 2 : 0, (b.value / (s === secondary ? rightTop : leftTop)) * PLOT_H);
        const rect = svgEl('rect', {
          x: cx(i) - barW / 2, y: PAD_T + PLOT_H - h, width: barW, height: h,
          rx: Math.min(4, barW / 2), class: 'chart-bar', style: `fill:${s.color}`,
        });
        svg.appendChild(rect);
        marks.push(rect);
      });
    } else {
      const runs = [];
      let run = [];
      s.buckets.forEach((b, i) => {
        if (b.value === null) { if (run.length) runs.push(run); run = []; }
        else run.push({ i, v: b.value });
      });
      if (run.length) runs.push(run);

      runs.forEach((r) => {
        if (r.length > 1) {
          const d = r.map((p, k) => `${k ? 'L' : 'M'}${cx(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
          if (!asLine) {
            const area = `${d} L${cx(r[r.length - 1].i).toFixed(1)},${PAD_T + PLOT_H} L${cx(r[0].i).toFixed(1)},${PAD_T + PLOT_H} Z`;
            svg.appendChild(svgEl('path', { d: area, class: 'chart-area', style: `fill:${s.color}` }));
          }
          svg.appendChild(svgEl('path', { d, class: 'chart-line', style: `stroke:${s.color}` }));
        }
      });
      s.buckets.forEach((b, i) => {
        if (b.value === null) { marks.push(null); return; }
        const dot = svgEl('circle', {
          cx: cx(i), cy: y(b.value), r: n > 45 ? 2 : 3.5, class: 'chart-dot', style: `fill:${s.color}`,
        });
        svg.appendChild(dot);
        marks.push(dot);
      });
    }
    return marks;
  }

  const primaryMarks = drawSeries(primary, false);
  const secondaryMarks = secondary ? drawSeries(secondary, true) : null;

  /* ---- selective direct labels: each series' most recent value ---- */
  [primary, secondary].filter(Boolean).forEach((s) => {
    const idx = s.buckets.map((b, i) => (b.value !== null ? i : -1)).filter((i) => i >= 0).pop();
    if (idx === undefined) return;
    const b = s.buckets[idx];
    const lx = Math.min(Math.max(cx(idx), PAD_L + 14), width - padR - 14);
    const t = svgEl('text', {
      x: lx, y: Math.max(11, yFor(s)(b.value) - 9), class: 'chart-point-label', 'text-anchor': 'middle',
      ...(secondary ? { style: `fill:${s.color}` } : {}),
    });
    t.textContent = s.format(b.value);
    svg.appendChild(t);
  });

  /* ---- x labels: first, last and a few between, never overlapping ---- */
  const maxLabels = Math.max(2, Math.floor(innerW / 54));
  const stride = Math.max(1, Math.ceil(n / maxLabels));
  buckets.forEach((b, i) => {
    if (i !== 0 && i !== n - 1 && i % stride !== 0) return;
    if (i !== n - 1 && (n - 1 - i) < stride * 0.6) return;
    const t = svgEl('text', {
      x: cx(i), y: PAD_T + PLOT_H + 16, class: 'chart-xtick', 'text-anchor': 'middle',
    });
    t.textContent = b.shortLabel;
    svg.appendChild(t);
  });

  /* ---- crosshair + hit layer ---- */
  const cross = svgEl('line', { class: 'chart-cross', y1: PAD_T, y2: PAD_T + PLOT_H, x1: 0, x2: 0, opacity: 0 });
  svg.appendChild(cross);

  const hit = svgEl('rect', {
    x: PAD_L, y: PAD_T, width: innerW, height: PLOT_H, fill: 'transparent', class: 'chart-hit',
  });
  svg.appendChild(hit);

  const lastIdx = buckets.map((b, i) => (b.value !== null ? i : -1)).filter((i) => i >= 0).pop();
  let activeIdx = lastIdx;
  const setActive = (i, pinned) => {
    if (i === null || i < 0 || i >= n) return;
    activeIdx = i;
    [primary, secondary].filter(Boolean).forEach((s, k) => {
      const b = s.buckets[i];
      const { rVal, rLab } = rows[k];
      rVal.textContent = b.value === null ? 'Not logged' : s.format(b.value);
      rLab.textContent = b.label + (b.value !== null && b.total > 1 ? ` · ${b.logged}/${b.total} days logged` : '');
    });
    primaryMarks.forEach((m, k) => m && m.classList.toggle('is-active', k === i));
    if (secondaryMarks) secondaryMarks.forEach((m, k) => m && m.classList.toggle('is-active', k === i));
    if (pinned) {
      cross.setAttribute('x1', cx(i));
      cross.setAttribute('x2', cx(i));
      cross.setAttribute('opacity', 1);
    }
  };

  const idxFromEvent = (ev) => {
    const box = svg.getBoundingClientRect();
    const scale = width / box.width;
    const px = (ev.clientX - box.left) * scale;
    return Math.max(0, Math.min(n - 1, Math.floor((px - PAD_L) / slot)));
  };

  const onMove = (ev) => { setActive(idxFromEvent(ev), true); };
  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerdown', onMove);
  svg.addEventListener('pointerleave', () => {
    cross.setAttribute('opacity', 0);
    setActive(lastIdx, false);
  });

  svg.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    setActive(activeIdx + (ev.key === 'ArrowRight' ? 1 : -1), true);
  });

  host.appendChild(svg);
  setActive(lastIdx, false);
}

/**
 * Decide whether a second series can share the primary's y-axis, or needs
 * its own on the right. Sharing is only honest when the two are actually
 * comparable — same unit, and neither dwarfs the other — otherwise a shared
 * axis draws a relationship between the lines that isn't really there.
 */
export function chooseAxis(primary, secondary) {
  if (!secondary) return 'left';
  const sameUnit = (primary.unit || '') === (secondary.unit || '');
  const pMax = Math.max(1e-9, ...primary.buckets.filter((b) => b.value !== null).map((b) => b.value));
  const sMax = Math.max(1e-9, ...secondary.buckets.filter((b) => b.value !== null).map((b) => b.value));
  const ratio = Math.max(pMax, sMax) / Math.min(pMax, sMax);
  return sameUnit && ratio <= 4 ? 'left' : 'right';
}
