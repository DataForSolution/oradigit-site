/* =========================================================
   OraDigit Order Helper v2 — app.js
   - Robust rules loader (meta-config + local JSON; optional Firestore overlay)
   - Populates all dropdowns (CT/MRI/PET-CT/US/XR/Mammo/DEXA/NM)
   - Live Order Review builder
   - Suggest Reason, Copy, Share, Reset
   - Optional Firebase write on submit (orders collection)
   - Defensive error handling with status beacons
========================================================= */

(() => {
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

  const setStatus = (msg, cls = 'oh-status success') => {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className = cls;
  };

  // Catch sync + async errors globally
  window.addEventListener('error', e =>
    setStatus('JavaScript error: ' + (e.message || 'Unknown'), 'oh-status error')
  );
  window.addEventListener('unhandledrejection', e =>
    setStatus('App error: ' + (e.reason?.message || e.reason || 'Unknown'), 'oh-status error')
  );

  // ---------- State ----------
  const state = { rules: null };

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', init);

  async function init () {
    try {
      await loadRules();
      populateModalities();
      wireEvents();
      buildReview();

      // If URL has hash payload (from share fallback), hydrate review
      if (location.hash && els.review) {
        const txt = decodeURIComponent(location.hash.slice(1));
        els.review.textContent = txt;
      }
      setStatus('Rules loaded.');
    } catch (e) {
      console.error(e);
      setStatus('Failed to initialize Order Helper.', 'oh-status error');
    }
  }

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

    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(window.ORADIGIT_FIREBASE_CONFIG);
    const db = firebase.firestore();
    const snap = await db.collection('order_helper_rules').doc('current').get();
    if (!snap.exists) return local;

    const remote = snap.data() || {};
    return mergeRules(local, remote);
  }

  function mergeRules (base, overlay) {
    // Conservative deep merge for fields we use
    const out = JSON.parse(JSON.stringify(base));
    if (!overlay) return out;
    for (const k of ['modalities', 'icd10_catalog']) {
      if (overlay[k]) {
        out[k] = { ...(out[k] || {}), ...overlay[k] };
      }
    }
    return out;
  }

  function normalizeRules (r) {
    // Accept either {modalities:{...}} or older flat style
    const src = r.modalities ? r.modalities : r;
    const out = { modalities: {} , icd10_catalog: Array.isArray(r.icd10_catalog) ? r.icd10_catalog : [] };

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
    const mods = Object.keys(state.rules.modalities || {});
    els.modality.innerHTML = optionize(mods, 'Select modality');
  }

  function populateForModality (mod) {
    const m = state.rules.modalities[mod] || {};
    els.region.innerHTML    = optionize(m.regions, 'Select region');
    els.bodyPart.innerHTML  = optionize(m.body_parts, 'Select body part');
    els.contrast.innerHTML  = optionize(m.contrast_options || ['None'], 'Select contrast');
    els.laterality.innerHTML= optionize(m.laterality || ['N/A','Left','Right','Bilateral'], 'Select laterality');
    els.context.innerHTML   = optionize(m.contexts || ['Staging','Restaging','Treatment response','Surveillance'], 'Select context');

    // Datalists
    renderDatalist(els.conditionList, m.conditions || []);
    const icd = new Set([...(state.rules.icd10_catalog || []), ...(m.icd10 || [])]);
    renderDatalist(els.icdList, [...icd]);

    // CPT (seed with common until we have enough selectors to compute)
    els.cpt.innerHTML = optionize(m.common_cpt || [], 'Suggested CPT');
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
    return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
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
      buildReview();
    });

    // Rebuild review on inputs
    [
      els.region, els.bodyPart, els.contrast, els.laterality, els.context,
      els.condition, els.icd10, els.cpt, els.urgency,
      els.pregnant, els.creatinineDate, els.allergies, els.special, els.indication
    ].forEach(el => el && el.addEventListener('input', () => {
      if ([els.region, els.bodyPart, els.contrast].includes(el)) {
        // Refresh CPT suggestions when key selectors change
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
        buildReview();
        return;
      } catch (e) {
        console.warn('Firestore submit failed:', e);
        setStatus('Saved locally (Firestore unavailable).', 'oh-status warn');
      }
    }

    // Fallback: download as .txt
    try {
      const blob = new Blob([payload.review || JSON.stringify(payload, null, 2)], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `order-${Date.now()}.txt`;
      a.click();
      setStatus('Downloaded order text.');
    } catch (e) {
      console.warn('Download fallback failed:', e);
      setStatus('Could not save order. Copy from the review panel.', 'oh-status warn');
    }
  }
})();
