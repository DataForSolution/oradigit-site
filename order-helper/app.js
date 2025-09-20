(() => {
  const qs = (s) => document.querySelector(s);
  const setStatus = (msg, cls = 'status success') => {
    const s = qs('#status'); if (s) { s.textContent = msg; s.className = cls; }
  };

  // Catch sync + async errors in one place
  window.addEventListener('error', e => setStatus('JavaScript error: ' + (e.message || 'Unknown'), 'status error'));
  window.addEventListener('unhandledrejection', e => setStatus('App error: ' + (e.reason?.message || e.reason || 'Unknown'), 'status error'));

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      // 1) Load rules.json from the meta tag (case-safe)
      const rulesPath = document.querySelector('meta[name="oh-rules-path"]')?.content;
      let rules = null;
      try {
        const r = await fetch(rulesPath, { cache: 'no-store' });
        if (r.ok) rules = await r.json();
      } catch (_) { /* fall through to defaults */ }
      if (!rules) { rules = defaultRules(); setStatus('Using built-in defaults (rules.json not found).', 'status warn'); }

      // 2) Normalize rules into a simple catalog
      const catalog = normalizeRules(rules);

      // 3) Build the UI + wire events
      buildUI(catalog);

      setStatus('Rules loaded.');
    } catch (e) {
      setStatus('Init failed: ' + e.message, 'status error');
    }
  }

  // ---------- Rules handling ----------
  function defaultRules() {
    return {
      modalities: {
        "PET/CT": {
          regions: ["Skull base to mid-thigh","Whole body","Brain","Head/Neck","Chest","Abdomen/Pelvis"],
          contexts: ["Staging","Restaging","Treatment response","Surveillance","Suspected recurrence","Infection / inflammation","Viability"],
          conditions: ["NSCLC","Lymphoma","Colorectal cancer","Melanoma","Head & neck cancer"]
        },
        "CT": {
          regions: ["Head","Neck","Chest","Abdomen","Pelvis","Abdomen/Pelvis","Angio chest (PE)"],
          contexts: ["Acute","Chronic","Follow-up"],
          conditions: ["Renal colic","PE","Appendicitis","Pancreatitis"]
        },
        "MRI": {
          regions: ["Brain","Cervical spine","Thoracic spine","Lumbar spine","Abdomen","Pelvis"],
          contexts: ["Acute","Follow-up","Problem solving"],
          conditions: ["MS","Seizure","Stroke","Back pain","Prostate cancer"]
        }
      }
    };
  }

  function normalizeRules(r) {
    // Accept either {modalities:{...}} or top-level { "PET/CT": {...}, ... }
    const src = r.modalities ? r.modalities : { "PET/CT": r["PET/CT"], "CT": r["CT"], "MRI": r["MRI"] };
    const out = { modalities: {} };

    for (const [mod, spec] of Object.entries(src || {})) {
      if (!spec) continue;
      const regions = Array.isArray(spec.regions) ? spec.regions
                    : Array.isArray(spec?.regions?.list) ? spec.regions.list
                    : Object.keys(spec.regions || {});
      const contexts = spec.contexts || spec.context || ["Staging","Restaging","Treatment response","Surveillance","Suspected recurrence"];
      const conditions = spec.conditions || spec.condition || [];
      out.modalities[mod] = {
        regions: [...new Set(regions)].filter(Boolean),
        contexts: [...new Set(contexts)].filter(Boolean),
        conditions: [...new Set(conditions)].filter(Boolean),
      };
    }
    return out;
  }

  // ---------- UI wiring ----------
  function buildUI(cat) {
    const modalitySel = qs('#modality');
    const regionSel   = qs('#region');
    const ctxChips    = qs('#contextChips');
    const ctxSelect   = qs('#context');          // hidden <select multiple>
    const conditionIn = qs('#condition');
    const conditionDL = qs('#conditionList');
    const contrastGrp = qs('#contrastGroup');

    const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
    const makeOpt = (v, t = v) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };

    function renderForMod(mod) {
      const spec = cat.modalities[mod] || { regions: [], contexts: [], conditions: [] };

      // Regions
      clear(regionSel);
      regionSel.append(makeOpt('', 'Select region…'));
      (spec.regions || []).forEach(r => regionSel.append(makeOpt(r)));

      // Context chips + hidden select
      clear(ctxChips); clear(ctxSelect);
      (spec.contexts || []).forEach(label => {
        const opt = makeOpt(label); opt.selected = false; ctxSelect.append(opt);

        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = label;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          b.classList.toggle('active');
          const on = b.classList.contains('active');
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          opt.selected = on;
          syncPreview();
        });
        ctxChips.append(b);
      });

      // Conditions datalist
      clear(conditionDL);
      (spec.conditions || []).forEach(c => {
        const o = document.createElement('option'); o.value = c; conditionDL.append(o);
      });

      // Contrast visibility
      if (mod === 'CT') { contrastGrp?.classList.remove('hidden'); }
      else { contrastGrp?.classList.add('hidden'); }

      // Reset values for new modality
      regionSel.value = '';
      conditionIn.value = '';
      [...ctxSelect.options].forEach(o => o.selected = false);
      [...ctxChips.querySelectorAll('.chip')].forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });

      syncPreview();
    }

    // Event wiring
    modalitySel.addEventListener('change', e => renderForMod(e.target.value));
    regionSel.addEventListener('change', syncPreview);
    conditionIn.addEventListener('input', syncPreview);
    document.querySelectorAll('input[name="contrast"],#oralContrast').forEach(i => i.addEventListener('change', syncPreview));
    qs('#indication')?.addEventListener('input', syncPreview);

    // Suggest Order → computes a simple recommendation & fills results
    qs('#orderForm')?.addEventListener('submit', e => {
      e.preventDefault();
      suggestStudy();
    });

    // Copy indication
    qs('#copyIndication')?.addEventListener('click', async () => {
      const txt = qs('#indication')?.value?.trim();
      if (!txt) return;
      try { await navigator.clipboard.writeText(txt); setStatus('Clinical indication copied.'); }
      catch { setStatus('Unable to copy. Please copy manually.', 'status warn'); }
    });

    // First render
    renderForMod(modalitySel.value || 'PET/CT');
  }

  function selectedContexts() {
    return Array.from(document.querySelectorAll('#context option:checked')).map(o => o.value);
  }

  function syncPreview() {
    const $ = (s) => document.querySelector(s);
    $('#pv-modality')  && ($('#pv-modality').textContent  = $('#modality')?.value || '—');
    $('#pv-region')    && ($('#pv-region').textContent    = $('#region')?.value || '—');
    const ctx = selectedContexts();
    $('#pv-context')   && ($('#pv-context').textContent   = ctx.length ? ctx.join(', ') : '—');
    $('#pv-condition') && ($('#pv-condition').textContent = $('#condition')?.value || '—');

    const grp = document.getElementById('contrastGroup');
    if (grp && !grp.classList.contains('hidden')) {
      const r = grp.querySelector('input[type=radio]:checked');
      const oral = document.getElementById('oralContrast')?.checked;
      let txt = r ? (r.value === 'with_iv' ? 'With IV contrast' : 'Without IV contrast') : '—';
      if (oral) txt += ' + oral';
      $('#pv-contrast').textContent = txt;
    } else {
      $('#pv-contrast').textContent = '—';
    }

    $('#pv-indication') && ($('#pv-indication').textContent = $('#indication')?.value?.trim() || '—');
  }

  function buildIndicationText() {
    const modality  = qs('#modality')?.value || '';
    const region    = qs('#region')?.value || '';
    const ctx       = selectedContexts();
    const condition = qs('#condition')?.value || '';
    const base = (modality === 'PET/CT') ? 'FDG PET/CT' : modality;
    const parts = [base, region].filter(Boolean).join(' ');
    const forTxt = [ctx.join(', '), condition].filter(Boolean).join(' — ');
    return [parts, forTxt ? `for ${forTxt}` : ''].filter(Boolean).join(' ');
  }

  function suggestStudy() {
    const modality  = qs('#modality')?.value || '';
    const region    = qs('#region')?.value || '';
    const ctx       = selectedContexts();
    const condition = qs('#condition')?.value || '';

    const list   = qs('#suggestions');
    const outHdr = qs('#outHeader');
    const outReason = qs('#outReason');

    // Clear list
    while (list.firstChild) list.removeChild(list.firstChild);

    const picks = [];
    const includes = (h, arr=[]) => arr.some(n => h.toLowerCase().includes(n.toLowerCase()));
    const hasCtx = (arr=[]) => arr.some(n => ctx.includes(n));

    if (modality === 'CT') {
      if (includes(condition, ['renal colic','stone'])) picks.push('CT Abdomen/Pelvis without IV contrast');
      else if (includes(condition, ['pe','pulmonary embol']) || (/chest/i.test(region) && hasCtx(['Acute']))) picks.push('CT Angio Chest (PE) with IV contrast');
      else if (/abdomen\/?pelvis/i.test(region)) picks.push('CT Abdomen/Pelvis with IV contrast');
      else if (/chest/i.test(region)) picks.push('CT Chest with IV contrast');
    }
    if (modality === 'PET/CT') {
      if (hasCtx(['Staging','Restaging','Surveillance','Suspected recurrence'])) picks.push('FDG PET/CT skull base to mid-thigh');
    }
    if (modality === 'MRI') {
      if (/brain/i.test(region)) picks.push('MRI Brain with and without contrast');
    }
    if (!picks.length) picks.push(`${modality} ${region}`.trim());

    picks.forEach(study => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${study}</strong>`;
      list.append(li);
    });

    qs('#results')?.removeAttribute('hidden');
    outHdr.textContent = picks[0] || 'Suggested study';
    const indication = buildIndicationText();
    outReason.value = indication;
    qs('#indication').value = indication;
    syncPreview();
  }
})();
