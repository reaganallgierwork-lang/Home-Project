/* ============================================================================
   BODY — weight entries and optional progress photos.
   ----------------------------------------------------------------------------
   One entry per day: a weight, a photo, or both. Reachable two ways — from
   this tab directly, or by tapping a day on the History calendar, which is
   why the entry sheet and the photo viewer are exported rather than kept
   private to this file.

   This module never imports from ui.js. ui.js imports FROM here (same
   direction as train.js and analyze.js) so there is no import cycle — see
   the comment on store.js's newId() re-export for why that matters.
   ========================================================================== */

import * as store from './store.js';
import { icon } from './icons.js';
import { openSheet as sheet, lockScroll, unlockScroll } from './sheet.js';

const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round1 = (n) => Math.round(n * 10) / 10;

let redraw = () => {};

/* ============================================================================
   THE TAB
   ========================================================================== */

export function renderWeight(state) {
  redraw = () => renderWeight(store.get());
  const unit = state.settings.weightUnit || 'lb';
  const today = store.todayKey();

  const days = Object.keys(state.bodyLog).sort();
  const entries = days.map((d) => ({ day: d, ...state.bodyLog[d] }));
  /* "Latest" and "change" only make sense over entries that actually have a
     weight — a photo-only day shouldn't count as a 0 in that comparison. */
  const weighed = entries.filter((e) => e.weight != null);
  const latest = weighed[weighed.length - 1] || null;
  const first = weighed[0] || null;
  const change = latest && first && weighed.length > 1 ? latest.weight - first.weight : null;

  const hasToday = !!state.bodyLog[today];

  el('screen-body').innerHTML = `
    <div class="topbar">
      <h1>Body<div class="sub">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} logged</div></h1>
    </div>

    <button class="btn primary big" id="logToday">
      ${icon('bodyweight', 18)} ${hasToday ? "Update today's weigh-in" : "Log today's weigh-in"}
    </button>

    ${entries.length ? `
      <div class="card tight">
        <div class="tiles">
          ${latest ? `<div class="tile"><b>${latest.weight} ${esc(unit)}</b><span>Latest</span></div>` : ''}
          ${change !== null ? `<div class="tile"><b>${change > 0 ? '+' : ''}${round1(change)}</b><span>All-time change</span></div>` : ''}
          <div class="tile"><b>${entries.length}</b><span>Entries</span></div>
        </div>
      </div>
      <div class="hint" style="text-align:center;margin:-4px 0 4px">
        Open the <b>Data</b> tab to chart this over months and years.
      </div>
      <div class="section-title">Recent entries</div>
      ${entries.slice().reverse().slice(0, 30).map((e) => entryRowHtml(e, unit)).join('')}
    ` : `
      <div class="empty">
        <div class="big">${icon('bodyweight', 34)}</div>
        No entries yet. Log today's weight to start your trend — a photo is entirely optional.
      </div>`}`;

  el('logToday').onclick = () => openBodyEntrySheet(store.get(), today, redraw);
  document.querySelectorAll('#screen-body [data-entry]').forEach((row) => {
    row.onclick = () => openBodyEntrySheet(store.get(), row.dataset.entry, redraw);
  });
}

function entryRowHtml(e, unit) {
  const thumb = e.photo
    ? `<img class="wthumb" src="${esc(e.photo)}" alt="">`
    : `<div class="wthumb placeholder">${icon('bodyweight', 18)}</div>`;
  const title = e.weight != null ? `${e.weight} ${unit}` : 'Photo only';
  return `
    <div class="wcard" data-entry="${esc(e.day)}">
      ${thumb}
      <div class="wc-body">
        <div class="wc-name">${esc(title)}</div>
        <div class="wc-sub">${esc(store.dayLabel(e.day, { weekday: 'short', month: 'short', day: 'numeric' }))}</div>
      </div>
      <span class="wc-chev">${icon('chevronRight', 18)}</span>
    </div>`;
}

/* ============================================================================
   THE ENTRY SHEET — exported so History's calendar can open it for any day.
   ========================================================================== */

/**
 * @param state    the current app state (pass store.get())
 * @param day      'YYYY-MM-DD' to open — an existing entry if there is one
 * @param onSaved  called after a save or delete actually lands, so the
 *                 caller can redraw wherever it needs to (this tab, or the
 *                 screen that was showing when the sheet was opened from
 *                 History)
 */
export function openBodyEntrySheet(state, day, onSaved = () => {}) {
  const existing = state.bodyLog[day] || null;
  const unit = state.settings.weightUnit || 'lb';
  let photoData = existing?.photo || null;
  let photoChanged = false;

  const photoTileHtml = () => (photoData
    ? `<div class="photo-tile has-photo">
         <img src="${esc(photoData)}" alt="">
         <button type="button" class="photo-remove" id="photoRemove" aria-label="Remove photo">${icon('close', 16)}</button>
         <button type="button" class="photo-expand" id="photoExpand" aria-label="View full size">${icon('expand', 15)}</button>
       </div>`
    : `<label class="photo-tile" for="photoInput">
         ${icon('camera', 22)}
         <span>Add a photo</span>
       </label>`);

  const close = sheet(`
    <h3>${existing ? 'Edit entry' : 'Log your weight'}</h3>
    <div class="lede">${existing ? 'Change anything, or remove this entry entirely.' : "Optional photo — nobody but you sees this file."}</div>
    <div class="field">
      <label>Date</label>
      <input type="date" id="wDate" value="${esc(day)}" max="${store.todayKey()}">
    </div>
    <div class="field">
      <label>Weight</label>
      <div class="weightin">
        <input type="number" inputmode="decimal" id="wVal" value="${existing?.weight ?? ''}" placeholder="0.0" step="0.1">
        <div class="seg small" id="wUnitSeg" style="width:auto;margin-bottom:0">
          <button type="button" data-u="lb" class="${unit === 'lb' ? 'on' : ''}">LB</button>
          <button type="button" data-u="kg" class="${unit === 'kg' ? 'on' : ''}">KG</button>
        </div>
      </div>
    </div>
    <div class="field">
      <label>Photo (optional)</label>
      <div id="photoWrap">${photoTileHtml()}</div>
      <input type="file" id="photoInput" accept="image/*" hidden>
      <div class="help">Stored only on this phone, inside your own backup file — never uploaded anywhere.</div>
    </div>
    <button class="btn primary" id="wSave">${existing ? 'Save changes' : 'Log it'}</button>
    ${existing ? '<button class="btn danger" id="wDelete">Delete this entry</button>' : ''}
    <button class="btn ghost" id="wCancel">Cancel</button>`);

  el('wUnitSeg').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      store.update((s) => { s.settings.weightUnit = b.dataset.u; });
      el('wUnitSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    };
  });

  function rebindPhotoTile() {
    el('photoWrap').innerHTML = photoTileHtml();
    if (photoData) {
      el('photoRemove').onclick = () => { photoData = null; photoChanged = true; rebindPhotoTile(); };
      el('photoExpand').onclick = () => openPhotoViewer(photoData);
    }
  }
  rebindPhotoTile();

  el('photoInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';   // lets picking the same file again still fire this handler
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('That does not look like an image.'); return; }
    try {
      photoData = await compressPhoto(file);
      photoChanged = true;
      rebindPhotoTile();
    } catch (err) {
      alert(err.message || 'Could not read that photo.');
    }
  };

  el('wSave').onclick = () => {
    const dateVal = el('wDate').value || day;
    const raw = el('wVal').value.trim();
    const weightNum = raw === '' ? null : +raw;
    if (raw !== '' && !Number.isFinite(weightNum)) { alert("That weight doesn't look like a number."); return; }
    if (weightNum === null && !photoData) { alert('Add a weight, a photo, or both.'); return; }

    /* Changing the date is really "move this entry" — delete the old slot so
       it doesn't linger with stale data once the record has relocated. */
    if (existing && dateVal !== day) store.deleteBodyEntry(day);

    const patch = { weight: weightNum };
    if (photoChanged) patch.photo = photoData;
    const { photoDropped } = store.setBodyEntry(dateVal, patch);

    close();
    onSaved();
    if (photoDropped) {
      toast('bodyweight', 'Weight saved', 'The photo was too large to fit — everything else saved fine.');
    }
  };

  if (existing) {
    el('wDelete').onclick = () => {
      if (!confirm('Delete this entry? This removes the weight and photo logged for this day.')) return;
      store.deleteBodyEntry(day);
      close();
      onSaved();
    };
  }
  el('wCancel').onclick = close;
}

/* ============================================================================
   PHOTO VIEWER — a plain full-screen lightbox.
   ========================================================================== */

export function openPhotoViewer(dataUrl) {
  const back = document.createElement('div');
  back.className = 'photo-viewer';
  back.innerHTML = `
    <button class="pv-close" aria-label="Close">${icon('close', 20)}</button>
    <img src="${esc(dataUrl)}" alt="">`;
  document.body.appendChild(back);
  lockScroll();
  const close = () => { back.remove(); unlockScroll(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('.pv-close')) close(); });
}

/* ============================================================================
   PHOTO COMPRESSION
   ----------------------------------------------------------------------------
   A phone camera photo straight off the file picker can be several megabytes;
   localStorage's whole budget is a handful. Shrink and re-encode before it
   ever touches storage, backing off through smaller passes until the result
   is a size that will actually fit. store.setBodyEntry()'s own fallback is
   the last line of defence if even the smallest pass somehow doesn't.
   ========================================================================== */

function readAsImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that photo.'));
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function drawToDataUrl(img, maxDim, quality) {
  let { width, height } = img;
  if (width >= height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
  else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function compressPhoto(file) {
  const img = await readAsImage(file);
  const passes = [[900, 0.72], [640, 0.55], [480, 0.4]];
  let out = drawToDataUrl(img, passes[0][0], passes[0][1]);
  for (let i = 1; i < passes.length && out.length > 700_000; i += 1) {
    out = drawToDataUrl(img, passes[i][0], passes[i][1]);
  }
  return out;
}

/* ============================================================================
   little helpers — deliberately local rather than imported from ui.js, so
   this module has no dependency on it (see the file header).
   ========================================================================== */

function toast(glyph, title, body) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const n = document.createElement('div');
  n.className = 'toast streak';
  n.innerHTML = `<div class="ic-wrap">${icon(glyph, 20)}</div><div class="tx"><div class="tt">${esc(title)}</div><div class="tb">${esc(body)}</div></div>`;
  box.appendChild(n);
  setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 320); }, 4200);
}
