/* =========================================================
   OraDigit Order Helper v2 — app.js
   - Robust rules loader (meta-config + local JSON; optional Firestore overlay)
   - Populates all dropdowns (CT/MRI/PET-CT/US/XR/Mammo/DEXA/NM)
   - Live Order Review builder
   - Suggest Reason, Copy, Share, Reset
   - Optional Firebase write on submit (orders collection)
<<<<<<< HEAD
   - Defensive error handling with status beacons + debug panel
========================================================= */

(() => {
  // ---------- App version (used for cache-busting) ----------
  const APP_VERSION = document.querySelector('meta[name="oh-version"]')?.content || String(Date.now());

  // ---------- Shorthands & elements ----------
=======
   - Defensive error handling with status beacons
========================================================= */

(() => {
>>>>>>> origin/main
  const $ = (s) => document.querySelector(s);
  const els = {
    form: $('#orderForm'),
    status: $('#status'),
    review: $('#review'),
    btnSuggest: $('#btnSuggest'),
    btnCopy: $('#btnCopy'),
    btnShare: $('#btnShare'),
    btnReset: $('#btnReset'),
    modality: $('#modality'),
    region: $('#region'),
    bodyPart: $('#bodyPart'),
    contrast: $('#contrast'),
    laterality: $('#laterality'),
    context: $('#context'),
    urgency: $('#urgency'),
    condition: $('#condition'),
    conditionList: $('#conditionList'),
    icd10: $('#icd10'),
    icdList: $('#icdList'),
    cpt: $('#cpt'),
    indication: $('#indication'),
    pregnant: $('#pregnant'),
    creatinineDate: $('#creatinineDate'),
    allergies: $('#allergies'),
    special: $('#special'),
  };

<<<<<<< HEAD
  // ---------- Status beacons ----------
  function setStatus(msg, cls = 'oh-status success', persist = true) {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className = cls;
    if (!persist) {
      setTimeout(() => {
        if (els.status.textContent === msg) {
          els.status.textContent = 'Ready.';
          els.status.className = 'oh-status';
        }
      }, 4000);
    }
    const tag = cls.includes('error') ? 'error' : cls.includes('warn') ? 'warn' : 'log';
    console[tag](`[OH] ${msg}`);
  }
=======
  const setStatus = (msg, cls = 'oh-status success') => {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className = cls;
  };
>>>>>>> origin/main

  // Catch sync + async errors globally
  window.addEventListener('error', e =>
    setStatus('JavaScript error: ' + (e.message || 'Unknown'), 'oh-status error')
  );
  window.addEventListener('unhandledrejection', e =>
    setStatus('App error: ' + (e.reason?.message || e.reason || 'Unknown'), 'oh-status error')
  );

  // ---------- State ----------
<<<<<<< HEAD
  const state = { rules: null, rulesSource: '' };
=======
  const state = { rules: null };
>>>>>>> origin/main

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    try {
<<<<<<< HEAD
      await loadRules();        // populates state.rules & state.rulesSource
      populateModalities();     // ensures a default selection
      wireEvents();
      buildReview();
      attachDebugPanel();
=======
      await loadRules();
      populateModalities();
      wireEvents();
      buildReview();
>>>>>>> origin/main

      // If URL has hash payload (from share fallback), hydrate review
      if (location.hash && els.review) {
        const txt = decodeURIComponent(location.hash.slice(1));
        els.review.textContent = txt;
      }
<<<<<<< HEAD
      setStatus(`Rules ready from ${state.rulesSource}`, 'oh-status success');
=======
      setStatus('Rules loaded.');
>>>>>>> origin/main
    } catch (e) {
      console.error(e);
      setStatus('Failed to initialize Order Helper.', 'oh-status error');
    }
  }

<<<<<<< HEAD
  // ---------- Cache-busting + safe JSON fetch ----------
  function cacheUrl(url) {
    try {
      const u = new URL(url, window.location.origin);
      if (!u.searchParams.has('v')) u.searchParams.set('v', APP_VERSION);
      return u.toString();
    } catch {
      return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(APP_VERSION);
    }
  }

  async function fetchJSON(url) {
    try {
      const r = await fetch(cacheUrl(url), { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  // ---------- Rules loading ----------
  async function loadRules () {
    setStatus('Loading rules…', 'oh-status');

    let source = null;
    const metaPath = document.querySelector('meta[name="oh-rules-path"]')?.content;
    const tryPaths = [
      metaPath,
      '/order-helper/data/rules.json',
      './data/rules.json',
      'data/rules.json'
    ].filter(Boolean);

    // 1) Primary rules.json attempts
    let base = null;
    for (const p of tryPaths) {
      const data = await fetchJSON(p);
      if (data && (data.modalities || data.CT || data.MRI)) {
        base = data; source = p; break;
      }
    }

    // 2) Legacy split files (ct_rules.json / mri_rules.json)
    if (!base) {
      const ct  = await fetchJSON('/order-helper/data/ct_rules.json')
              || await fetchJSON('./data/ct_rules.json')
              || await fetchJSON('data/ct_rules.json');
      const mri = await fetchJSON('/order-helper/data/mri_rules.json')
              || await fetchJSON('./data/mri_rules.json')
              || await fetchJSON('data/mri_rules.json');
      if (ct || mri) {
        base = { modalities: {} };
        if (ct)  base.modalities['CT']  = ct.modalities?.CT  || ct.CT  || ct;
        if (mri) base.modalities['MRI'] = mri.modalities?.MRI || mri.MRI || mri;
        source = 'legacy ct_rules.json + mri_rules.json';
      }
    }

    // 3) Embedded emergency defaults (UI never empty)
    if (!base) {
      console.warn('[OH] No rules file found; using embedded defaults.');
      base = {
        modalities: {
          'CT': {
            regions: ['Head/Brain', 'Chest', 'Abdomen/Pelvis'],
            body_parts: ['Brain', 'Thorax', 'Abdomen and pelvis'],
            contrast_options: ['None','With contrast','Without contrast','With and without'],
            contexts: ['Acute','Oncology staging','Follow-up'],
            conditions: ['Stroke/TIA','Lung nodule','RLQ pain/appendicitis'],
            common_cpt: ['70450','71260','74177'],
            cpt_map: {
              'Head/Brain | Brain | Without contrast': ['70450'],
              'Chest | Thorax | With contrast': ['71260'],
              'Abdomen/Pelvis | Abdomen and pelvis | With contrast': ['74177']
            }
          },
          'MRI': {
            regions: ['Brain','Lumbar spine','Prostate (PI-RADS)'],
            body_parts: ['Brain','Lumbar spine','Prostate'],
            contrast_options: ['None','With and without'],
            contexts: ['Problem solving','Staging','Follow-up'],
            conditions: ['Tumor','Radiculopathy','Prostate cancer'],
            common_cpt: ['70553','72148','72197'],
            cpt_map: {
              'Brain | Brain | With and without': ['70553'],
              'Lumbar spine | Lumbar spine | Without contrast': ['72148'],
              'Prostate (PI-RADS) | Prostate | With and without': ['72197']
            }
          }
        },
        icd10_catalog: ['I63.9','R91.1','R10.31','C61','G35']
      };
      source = 'embedded defaults';
    }

    // 4) Facility overlay (optional)
    const facility =
        await fetchJSON('/order-helper/data/rules.facility.json')
     || await fetchJSON('./data/rules.facility.json')
     || await fetchJSON('data/rules.facility.json');
    if (facility) {
      base = mergeRules(base, facility);
      source += ' + facility overlay';
    }

    // 5) Optional Firestore overlay
    const overlaid = await overlayRemoteRules(base).catch(err => {
      console.warn('[OH] Remote overlay failed:', err);
      return base;
    });
    if (overlaid !== base) source += ' + remote overlay';

    // 6) Normalize to app schema
    state.rules = normalizeRules(overlaid);
    state.rulesSource = source || 'unknown';

    // 7) Sanity guard
    if (!state.rules || !state.rules.modalities || !Object.keys(state.rules.modalities).length) {
      await loadRulesFallback();
      state.rulesSource = 'emergency defaults';
    }

    const mods = Object.keys(state.rules.modalities || {});
    setStatus(`Rules ready from ${state.rulesSource} — ${mods.length} modalities.`, 'oh-status success');
  }

  // Last-resort fallback
  async function loadRulesFallback() {
    state.rules = {
      modalities: {
        'CT': {
          regions: ['Head/Brain'],
          body_parts: ['Brain'],
          contrast_options: ['Without contrast'],
          contexts: ['Acute'],
          conditions: ['Stroke/TIA'],
          common_cpt: ['70450'],
          cpt_map: { 'Head/Brain | Brain | Without contrast': ['70450'] }
        }
      },
      icd10_catalog: ['I63.9']
    };
    setStatus('Using emergency defaults. Please fix rules.json path/schema.', 'oh-status warn');
  }

  // Optional: overlay from Firestore (if configured globally)
  async function overlayRemoteRules (local) {
    if (!(window.ORADIGIT_FIREBASE_CONFIG && window.firebase)) return local;
=======
  // ---------- Rules loading ----------
  async function loadRules () {
    setStatus('Loading rules…', 'oh-status');
    // Prefer meta tag path if present
    const metaPath = document.querySelector('meta[name="oh-rules-path"]')?.content;
    const RULES_URL = metaPath || new URL('./data/rules.json', window.location).toString();

    // Load local rules.json
    const res = await fetch(RULES_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load rules.json (' + res.status + ')');
    const local = await res.json();

    // Optional: overlay remote rules (Firestore) if configured
    const merged = await overlayRemoteRules(local).catch(err => {
      console.warn('Remote overlay failed, using local rules only:', err);
      return local;
    });

    state.rules = normalizeRules(merged);
  }

  async function overlayRemoteRules (local) {
    if (!(window.ORADIGIT_FIREBASE_CONFIG && window.firebase)) return local;

>>>>>>> origin/main
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(window.ORADIGIT_FIREBASE_CONFIG);
    const db = firebase.firestore();
    const snap = await db.collection('order_helper_rules').doc('current').get();
    if (!snap.exists) return local;
<<<<<<< HEAD
=======

>>>>>>> origin/main
    const remote = snap.data() || {};
    return mergeRules(local, remote);
  }

<<<<<<< HEAD
  // Conservative deep merge for fields we use
  function mergeRules (base, overlay) {
    const out = JSON.parse(JSON.stringify(base || {}));
    if (!overlay) return out;
    if (overlay.modalities) {
      out.modalities = { ...(out.modalities || {}), ...overlay.modalities };
    }
    if (Array.isArray(overlay.icd10_catalog)) {
      const set = new Set([...(out.icd10_catalog || []), ...overlay.icd10_catalog]);
      out.icd10_catalog = [...set];
=======
  function mergeRules (base, overlay) {
    // Conservative deep merge for fields we use
    const out = JSON.parse(JSON.stringify(base));
    if (!overlay) return out;
    for (const k of ['modalities', 'icd10_catalog']) {
      if (overlay[k]) {
        out[k] = { ...(out[k] || {}), ...overlay[k] };
      }
>>>>>>> origin/main
    }
    return out;
  }

<<<<<<< HEAD
  // Normalize to a stable shape the UI expects
  function normalizeRules (r) {
    const src = r?.modalities ? r.modalities : r || {};
    const out = { modalities: {} , icd10_catalog: Array.isArray(r?.icd10_catalog) ? r.icd10_catalog : [] };
=======
  function normalizeRules (r) {
    // Accept either {modalities:{...}} or older flat style
    const src = r.modalities ? r.modalities : r;
    const out = { modalities: {} , icd10_catalog: Array.isArray(r.icd10_catalog) ? r.icd10_catalog : [] };
>>>>>>> origin/main

    for (const [mod, specRaw] of Object.entries(src || {})) {
      if (!specRaw) continue;
      const spec = { ...specRaw };

      const regions    = arr(spec.regions);
      const body_parts = arr(spec.body_parts);
      const contrast   = arr(spec.contrast_options, ['None','With contrast','Without contrast','With and without']);
      const laterality = arr(spec.laterality, ['N/A','Left','Right','Bilateral']);
      const contexts   = arr(spec.contexts, ['Staging','Restaging','Treatment response','Surveillance','Screening','Acute']);
      const conditions = arr(spec.conditions);
      const icd10      = arr(spec.icd10);
      const common_cpt = arr(spec.common_cpt);
      const cpt_map    = spec.cpt_map && typeof spec.cpt_map === 'object' ? spec.cpt_map : {};

      out.modalities[mod] = {
        regions, body_parts,
        contrast_options: contrast,
        laterality, contexts, conditions, icd10,
        common_cpt, cpt_map
      };
    }
    return out;

    function arr (x, fallback = []) {
      if (Array.isArray(x)) return x.filter(Boolean);
      if (x && Array.isArray(x.list)) return x.list.filter(Boolean);
      return fallback.slice();
    }
  }

  // ---------- UI population ----------
  function populateModalities () {
<<<<<<< HEAD
    const mods = Object.keys(state.rules.modalities || []);
    els.modality.innerHTML = optionize(mods, 'Select modality');

    // Auto-select first modality to ensure dependent selects populate
    if (mods.length && !els.modality.value) {
      els.modality.value = mods[0];
      populateForModality(els.modality.value);
    }
=======
    const mods = Object.keys(state.rules.modalities || {});
    els.modality.innerHTML = optionize(mods, 'Select modality');
>>>>>>> origin/main
  }

  function populateForModality (mod) {
    const m = state.rules.modalities[mod] || {};
<<<<<<< HEAD
    els.region.innerHTML     = optionize(m.regions, 'Select region');
    els.bodyPart.innerHTML   = optionize(m.body_parts, 'Select body part');
    els.contrast.innerHTML   = optionize(m.contrast_options || ['None'], 'Select contrast');
    els.laterality.innerHTML = optionize(m.laterality || ['N/A','Left','Right','Bilateral'], 'Select laterality');
    els.context.innerHTML    = optionize(m.contexts || ['Staging','Restaging','Treatment response','Surveillance'], 'Select context');
=======
    els.region.innerHTML    = optionize(m.regions, 'Select region');
    els.bodyPart.innerHTML  = optionize(m.body_parts, 'Select body part');
    els.contrast.innerHTML  = optionize(m.contrast_options || ['None'], 'Select contrast');
    els.laterality.innerHTML= optionize(m.laterality || ['N/A','Left','Right','Bilateral'], 'Select laterality');
    els.context.innerHTML   = optionize(m.contexts || ['Staging','Restaging','Treatment response','Surveillance'], 'Select context');
>>>>>>> origin/main

    // Datalists
    renderDatalist(els.conditionList, m.conditions || []);
    const icd = new Set([...(state.rules.icd10_catalog || []), ...(m.icd10 || [])]);
    renderDatalist(els.icdList, [...icd]);

<<<<<<< HEAD
    // Seed CPT with common until we can compute from selections
    els.cpt.innerHTML = optionize(m.common_cpt || [], 'Suggested CPT');

    buildReview();
=======
    // CPT (seed with common until we have enough selectors to compute)
    els.cpt.innerHTML = optionize(m.common_cpt || [], 'Suggested CPT');
>>>>>>> origin/main
  }

  function optionize (arr, placeholder) {
    const opts = (arr || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    return `<option value="" disabled selected>${escapeHtml(placeholder)}</option>${opts}`;
  }

  function renderDatalist (node, arr) {
    if (!node) return;
    node.innerHTML = (arr || []).map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  }

  function escapeHtml (s = '') {
<<<<<<< HEAD
    return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
=======
    return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
>>>>>>> origin/main
  }

  // ---------- CPT suggestion ----------
  function suggestCPT () {
    const mod = els.modality.value;
    if (!mod) return [];
    const m = state.rules.modalities[mod] || {};
    const key = [els.region.value, els.bodyPart.value, els.contrast.value].join(' | ');
    const table = m.cpt_map || {};
    const hits = table[key] || [];
    return hits.length ? hits : (m.common_cpt || []);
  }

  // ---------- Reason / Review builders ----------
  function buildReason () {
    const cond = els.condition.value || els.icd10.value || '(no coded condition)';
    const ctx  = els.context.value ? `${els.context.value.toLowerCase()}` : 'diagnostic';

    if (els.indication.value && els.indication.value.trim()) {
      return els.indication.value.trim();
    }
    const base = `Evaluate ${cond} with ${els.modality.value} ${els.bodyPart.value || els.region.value}`.trim();
    const bits = [];
    if (els.contrast.value && els.contrast.value !== 'None') bits.push(els.contrast.value.toLowerCase());
    if (els.laterality.value && els.laterality.value !== 'N/A') bits.push(els.laterality.value.toLowerCase());
    if (els.context.value) bits.push(`for ${ctx}`);
    return [base, bits.join(', ')].filter(Boolean).join(', ').replace(/, for/, ' for');
  }

  function buildReview () {
    if (!els.review) return;
    const lines = [];
    const cptList = suggestCPT();

    const study = `${val(els.modality)} ${val(els.bodyPart) || val(els.region)} ${val(els.contrast)}`.replace(/\s+/g,' ').trim();
    if (study) lines.push(`Study: ${study}`);
    if (els.laterality.value && els.laterality.value !== 'N/A') lines.push(`Laterality: ${els.laterality.value}`);
    if (els.context.value) lines.push(`Context: ${els.context.value}`);
    if (els.condition.value) lines.push(`Condition: ${els.condition.value}`);
    if (els.icd10.value) lines.push(`ICD-10: ${els.icd10.value}`);
    if (cptList.length) lines.push(`Suggested CPT: ${cptList.join(', ')}`);
    if (els.urgency.value) lines.push(`Urgency: ${els.urgency.value}`);
    if (els.pregnant.value && els.pregnant.value!=='Unknown') lines.push(`Pregnancy: ${els.pregnant.value}`);
    if (els.creatinineDate.value) lines.push(`Most recent creatinine: ${els.creatinineDate.value}`);
    if (els.allergies.value) lines.push(`Allergies/precautions: ${els.allergies.value}`);
    if (els.special.value) lines.push(`Special instructions: ${els.special.value}`);

    const reason = buildReason();
    if (reason) lines.push(`Reason for exam: ${reason}`);

    els.review.textContent = lines.filter(Boolean).join('\n');
  }

  function val (el) {
    return (el && el.value && el.value !== 'None' && el.value !== 'N/A') ? el.value : '';
  }

  // ---------- Events ----------
  function wireEvents () {
    // Change of modality populates dependent fields
    els.modality.addEventListener('change', () => {
      populateForModality(els.modality.value);
<<<<<<< HEAD
    });

    // Rebuild review on inputs + refresh CPT when key selectors change
=======
      buildReview();
    });

    // Rebuild review on inputs
>>>>>>> origin/main
    [
      els.region, els.bodyPart, els.contrast, els.laterality, els.context,
      els.condition, els.icd10, els.cpt, els.urgency,
      els.pregnant, els.creatinineDate, els.allergies, els.special, els.indication
    ].forEach(el => el && el.addEventListener('input', () => {
      if ([els.region, els.bodyPart, els.contrast].includes(el)) {

        // Refresh CPT suggestions when key selectors change
>>>>>>> origin/main
        const options = suggestCPT();
        els.cpt.innerHTML = optionize(options, 'Suggested CPT');
      }
      buildReview();
    }));

    // Suggest Reason
    els.btnSuggest?.addEventListener('click', () => {
      els.indication.value = buildReason();
      buildReview();
      setStatus('Suggested reason inserted.');
    });

    // Copy review
    els.btnCopy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(els.review.textContent || '');
        setStatus('Copied to clipboard.');
      } catch {
        setStatus('Unable to copy. Select and copy manually.', 'oh-status warn');
      }
    });

    // Share review
    els.btnShare?.addEventListener('click', async () => {
      const text = els.review.textContent || '';
      const title = 'Radiology Order';
      try {
        if (navigator.share) {
          await navigator.share({ title, text });
        } else {
          const url = new URL(window.location);
          url.hash = encodeURIComponent(text);
          await navigator.clipboard.writeText(url.toString());
          alert('Share not supported. A sharable URL has been copied to your clipboard.');
        }
        setStatus('Shared.');
      } catch (e) {
        console.warn(e);
        setStatus('Share canceled.', 'oh-status warn');
      }
    });

    // Reset
    els.btnReset?.addEventListener('click', () => {
      els.form.reset();
      populateModalities();
      els.review.textContent = 'Select options to build the order…';
      setStatus('Form reset.');
    });

    // Submit
    els.form?.addEventListener('submit', onSubmit);
  }


  // ---------- Submit (optional Firestore write) ----------
=======
>>>>>>> origin/main
  async function onSubmit (evt) {
    evt.preventDefault();
    const payload = {
      created_at: new Date().toISOString(),
      modality: els.modality.value,
      region: els.region.value,
      bodyPart: els.bodyPart.value,
      contrast: els.contrast.value,
      laterality: els.laterality.value,
      context: els.context.value,
      urgency: els.urgency.value,
      condition: els.condition.value,
      icd10: els.icd10.value,
      cpt: els.cpt.value,
      indication: els.indication.value || buildReason(),
      pregnant: els.pregnant.value,
      creatinineDate: els.creatinineDate.value,
      allergies: els.allergies.value,
      special: els.special.value,
      review: els.review.textContent
    };

    // Optional Firestore write
    if (window.ORADIGIT_FIREBASE_CONFIG && window.firebase) {
      try {
        const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(window.ORADIGIT_FIREBASE_CONFIG);
        const db = firebase.firestore();
        await db.collection('orders').add(payload);
        setStatus('Submitted to Firestore.');
        els.form.reset();
<<<<<<< HEAD
        populateModalities();
=======
>>>>>>> origin/main
        buildReview();
        return;
      } catch (e) {
        console.warn('Firestore submit failed:', e);
        setStatus('Saved locally (Firestore unavailable).', 'oh-status warn');
      }
    }

    
    // Generate a PDF of the order
try {
  await generatePDF(payload);
  setStatus('PDF generated.');
} catch (e) {
  console.warn('PDF generation failed:', e);
  setStatus('PDF generation failed. Use Copy as fallback.', 'oh-status warn');
}


  // ---------- Debug panel (query ?debug=1) ----------
  function attachDebugPanel() {
    if (new URLSearchParams(location.search).get('debug') !== '1') return;
    const host = document.querySelector('.oh-hero .container') || document.body;
    const el = document.createElement('div');
    el.style.cssText = 'margin-top:.75rem;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;color:#64748b';
    el.id = 'oh-debug';
    host.appendChild(el);

    const update = () => {
      try {
        const mods = Object.keys(state?.rules?.modalities || {});
        const mod = document.querySelector('#modality')?.value || '(none)';
        el.textContent = `[OH DEBUG] v=${APP_VERSION} | source=${state.rulesSource} | modalities=${mods.length} [${mods.join(', ')}] | selected=${mod}`;
      } catch {
        el.textContent = `[OH DEBUG] v=${APP_VERSION} | (no rules yet)`;
      }
    };
    update();
    document.addEventListener('input', update, true);
    document.addEventListener('change', update, true);
  }
  async function generatePDF(payload) {
  // Ensure library is ready
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    console.warn('jsPDF not available');
    alert('PDF generator unavailable. Please try again or use Copy.');
    return;
  }

  const doc = new jsPDF({ unit: 'pt', format: 'letter' }); // 612x792pt
  const marginX = 54; // 0.75"
  const lineH = 18;
  let y = 72; // 1" top

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Radiology Order', marginX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y + lineH);
  y += (lineH * 2);

  // Utility: wrapped text block
  function write(label, value) {
    if (!value) return;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.setFontSize(11);
    doc.text(label, marginX, y);
    y += 14;

    doc.setFont('courier', 'normal'); // mono for aligned look
    doc.setTextColor(30);
    doc.setFontSize(11);

    const maxWidth = 612 - marginX * 2;
    const rows = doc.splitTextToSize(String(value), maxWidth);
    rows.forEach(row => {
      doc.text(row, marginX, y);
      y += lineH;
      if (y > 760) { // page break safety
        doc.addPage();
        y = 72;
      }
    });
    y += 6;
  }

  // Content
  write('Study', `${payload.modality} ${payload.bodyPart || payload.region} ${payload.contrast}`.replace(/\s+/g,' ').trim());
  if (payload.laterality && payload.laterality !== 'N/A') write('Laterality', payload.laterality);
  if (payload.context) write('Context', payload.context);
  if (payload.urgency) write('Urgency', payload.urgency);
  if (payload.condition) write('Condition', payload.condition);
  if (payload.icd10) write('ICD-10', payload.icd10);
  if (payload.cpt) write('CPT (suggested)', payload.cpt);
  if (payload.creatinineDate) write('Most recent creatinine', payload.creatinineDate);
  if (payload.pregnant && payload.pregnant !== 'Unknown') write('Pregnancy', payload.pregnant);
  if (payload.allergies) write('Allergies / Precautions', payload.allergies);
  if (payload.special) write('Special instructions', payload.special);
  write('Reason for exam', payload.indication || payload.review);
  write('Order summary', payload.review);

  // Footer disclaimer (optional)
  if (y > 720) { doc.addPage(); y = 72; }
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(110);
  doc.setFontSize(9);
  doc.text('Structured for ordering clarity. Educational use only; not medical advice.', marginX, 780);

  // Save
  const fnameParts = [
    'order',
    (payload.modality || '').replace(/\W+/g,'-').toLowerCase(),
    Date.now()
  ].filter(Boolean);
  const filename = `${fnameParts.join('_')}.pdf`;
  doc.save(filename);
}
