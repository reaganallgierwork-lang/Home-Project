/* ============================================================================
   CHART — one reusable time-series chart, drawn as SVG.
   ----------------------------------------------------------------------------
   Knows nothing about habits or metrics: hand it buckets and a formatter and
   it draws them. Any future data source gets the same chart for free.

   Design rules it follows (so it stays readable rather than merely colourful):
     • One series only. Two y-scales on one plot invent correlations that
       aren't in the data, so a second measure gets its own chart instead.
     • Thin marks, hairline solid gridlines, no dashes, lots of air.
     • Values are labelled SELECTIVELY — the last point and the best one — not
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
const PAD_L = 42;        // room for y-axis numbers
const PAD_R = 12;
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
 *   buckets:   [{key,label,shortLabel,value,logged,total}]
 *   form:      'line' | 'bar'
 *   target:    number|null      draws a reference line
 *   format:    (value) => string
 *   targetLabel: string
 *   onEmpty:   string
 * }
 */
export function renderChart(host, spec) {
  host.textContent = '';
  const { buckets = [], form = 'line', target = null, format = (v) => String(v) } = spec;

  const withData = buckets.filter((b) => b.value !== null);
  if (!withData.length) {
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    empty.textContent = spec.onEmpty || 'Nothing logged in this window yet.';
    host.appendChild(empty);
    return;
  }

  /* A pinned readout above the plot rather than a floating bubble — on a
     phone a floating tooltip gets clipped and fights the thumb. */
  const readout = document.createElement('div');
  readout.className = 'chart-readout';
  const rVal = document.createElement('b');
  const rLab = document.createElement('span');
  readout.append(rVal, rLab);
  host.appendChild(readout);

  const width = Math.max(240, host.clientWidth || 320);
  const innerW = width - PAD_L - PAD_R;
  const totalH = PAD_T + PLOT_H + AXIS_H;

  const svg = svgEl('svg', {
    width: '100%', viewBox: `0 0 ${width} ${totalH}`, class: 'chart-svg',
    role: 'img', tabindex: '0',
    'aria-label': spec.ariaLabel || 'Trend chart',
  });

  const dataMax = Math.max(...withData.map((b) => b.value));
  const top = niceMax(Math.max(dataMax, target || 0));
  const y = (v) => PAD_T + PLOT_H - (v / top) * PLOT_H;

  /* ---- gridlines + y labels: solid hairlines, recessive ---- */
  [0, 0.5, 1].forEach((f) => {
    const val = top * f;
    const yy = y(val);
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: width - PAD_R, y1: yy, y2: yy, class: 'chart-grid',
    }));
    const t = svgEl('text', { x: PAD_L - 7, y: yy + 3.5, class: 'chart-ytick', 'text-anchor': 'end' });
    t.textContent = format(val, { axis: true });
    svg.appendChild(t);
  });

  /* ---- the goal line, if this metric has one ---- */
  if (target !== null && target <= top) {
    const ty = y(target);
    svg.appendChild(svgEl('line', {
      x1: PAD_L, x2: width - PAD_R, y1: ty, y2: ty, class: 'chart-target',
    }));
    /* Anchored left (the right edge belongs to the end-of-line value label)
       and sat BELOW the line — point labels always sit above their dot, so a
       point that lands exactly on the goal can't collide with this. */
    const tl = svgEl('text', { x: PAD_L + 3, y: ty + 12, class: 'chart-target-label', 'text-anchor': 'start' });
    tl.textContent = spec.targetLabel || 'goal';
    svg.appendChild(tl);
  }

  const n = buckets.length;
  const slot = innerW / n;
  const cx = (i) => PAD_L + slot * i + slot / 2;

  const marks = [];   // one entry per bucket, for hit-testing

  if (form === 'bar') {
    /* Columns: capped thickness, 2px of surface between neighbours, rounded
       cap and square base. */
    const barW = Math.max(3, Math.min(24, slot - 2));
    buckets.forEach((b, i) => {
      if (b.value === null) { marks.push(null); return; }
      const h = Math.max(b.value > 0 ? 2 : 0, (b.value / top) * PLOT_H);
      const rect = svgEl('rect', {
        x: cx(i) - barW / 2, y: PAD_T + PLOT_H - h, width: barW, height: h,
        rx: Math.min(4, barW / 2), class: 'chart-bar',
      });
      svg.appendChild(rect);
      marks.push(rect);
    });
  } else {
    /* Line + area wash, broken into runs so missing days leave real gaps. */
    const runs = [];
    let run = [];
    buckets.forEach((b, i) => {
      if (b.value === null) { if (run.length) runs.push(run); run = []; }
      else run.push({ i, v: b.value });
    });
    if (run.length) runs.push(run);

    runs.forEach((r) => {
      if (r.length > 1) {
        const d = r.map((p, k) => `${k ? 'L' : 'M'}${cx(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
        const area = `${d} L${cx(r[r.length - 1].i).toFixed(1)},${PAD_T + PLOT_H} L${cx(r[0].i).toFixed(1)},${PAD_T + PLOT_H} Z`;
        svg.appendChild(svgEl('path', { d: area, class: 'chart-area' }));
        svg.appendChild(svgEl('path', { d, class: 'chart-line' }));
      }
    });
    buckets.forEach((b, i) => {
      if (b.value === null) { marks.push(null); return; }
      const dot = svgEl('circle', { cx: cx(i), cy: y(b.value), r: n > 45 ? 2 : 3.5, class: 'chart-dot' });
      svg.appendChild(dot);
      marks.push(dot);
    });
  }

  /* ---- selective direct labels: the most recent value, and the best one ---- */
  const lastIdx = buckets.map((b, i) => (b.value !== null ? i : -1)).filter((i) => i >= 0).pop();
  const bestIdx = buckets.reduce((best, b, i) => (b.value !== null && (best < 0 || b.value > buckets[best].value) ? i : best), -1);
  const labelled = new Set([lastIdx]);
  /* Only label the peak separately when the two labels can't collide.
     Measured in pixels, not in bucket indexes — with few wide buckets,
     "two apart" is still the same patch of screen. */
  const approxLabelW = 54;
  if (bestIdx >= 0 && lastIdx !== undefined && Math.abs(cx(bestIdx) - cx(lastIdx)) > approxLabelW) {
    labelled.add(bestIdx);
  }

  labelled.forEach((i) => {
    if (i === undefined || i < 0) return;
    const b = buckets[i];
    const lx = Math.min(Math.max(cx(i), PAD_L + 14), width - PAD_R - 14);
    const t = svgEl('text', {
      x: lx, y: Math.max(11, y(b.value) - 9), class: 'chart-point-label', 'text-anchor': 'middle',
    });
    t.textContent = format(b.value);
    svg.appendChild(t);
  });

  /* ---- x labels: first, last and a few between, never overlapping ---- */
  const maxLabels = Math.max(2, Math.floor(innerW / 54));
  const stride = Math.max(1, Math.ceil(n / maxLabels));
  buckets.forEach((b, i) => {
    if (i !== 0 && i !== n - 1 && i % stride !== 0) return;
    /* Drop a middle label that would collide with the final one. */
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

  let activeIdx = lastIdx;
  const setActive = (i, pinned) => {
    if (i === null || i < 0 || i >= n) return;
    activeIdx = i;
    const b = buckets[i];
    rVal.textContent = b.value === null ? 'Not logged' : format(b.value);
    rLab.textContent = b.label + (b.value !== null && b.total > 1 ? ` · ${b.logged}/${b.total} days logged` : '');
    marks.forEach((m, k) => m && m.classList.toggle('is-active', k === i));
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

  /* Keyboard parity: the same readout, without a pointer. */
  svg.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    setActive(activeIdx + (ev.key === 'ArrowRight' ? 1 : -1), true);
  });

  host.appendChild(svg);
  setActive(lastIdx, false);
}
