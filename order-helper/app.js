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

<<<<<<< HEAD
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
=======
    fillSelect(els.region, node.regions || [], "Select region…");

    if (els.contextChips) {
      renderContextChips(node.contexts || []);
      mirrorChipsToHiddenSelect();
    } else {
      fillSelect(els.context, node.contexts || [], "Select context…");
    }

    fillDatalist(els.conditionList, node.conditions || []);

    // Contrast only for CT
    showContrast(modality === "CT");

    // Reset textual fields
    if (els.condition) els.condition.value = "";
    if (els.indication) els.indication.value = "";

    // Ask any external preview sync to re-render
    try { document.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
  }

  // -------- Contrast suggestions for CT --------
  function suggestContrastIfCT(modalityNode, conditionText, regionText) {
    if (!modalityNode?.contrast_recommendations) return;
    const text = `${conditionText || ""} ${regionText || ""}`.toLowerCase();
    for (const rule of modalityNode.contrast_recommendations) {
      const allMatch = rule.match.every((token) => text.includes(token));
      if (allMatch) {
        const target = els.contrastGroup?.querySelector(
          `input[type=radio][value="${rule.suggest}"]`
        );
        if (target) target.checked = true;
        break;
      }
    }
    // Guardrail: any CTA should be with IV
    if ((regionText || "").toLowerCase().includes("cta")) {
      const withIV = els.contrastGroup?.querySelector(
        'input[type=radio][value="with_iv"]'
      );
      if (withIV) withIV.checked = true;
    }
  }

  // -------- Indication builder --------
  function buildIndication(modalityNode, modality) {
    if (!els.indication) return;
    const region = els.region?.value || "";
    const contexts = els.contextChips
      ? getSelectedContextsFromChips().join(", ")
      : (() => {
          const sel = els.context;
          return sel ? [...sel.selectedOptions].map((o) => o.textContent.trim()).join(", ") : "";
        })();
    const condition = els.condition?.value || "";
    const contrast_text = contrastTextFromForm();
    const templates =
      modalityNode?.indication_templates ||
      (modality === "CT"
        ? ["CT {region} – {context} for {condition}"]
        : modality === "PET/CT"
        ? ["FDG PET/CT {region} – {context} for {condition}"]
        : ["{region} – {context} for {condition}"]);
    const t =
      (contrast_text && templates.find((x) => x.includes("{contrast_text}"))) ||
      templates[0];

    const out = t
      .replace("{region}", region)
      .replace("{context}", contexts)
      .replace("{condition}", condition)
      .replace("{contrast_text}", contrast_text ? ` ${contrast_text}` : "");
    els.indication.value = out.trim();
  }

  // -------- Basic record matcher (suggest studies) --------
  function scoreRecord(rec, modality, region, contexts, condition) {
    if (!(rec.modality || "").toUpperCase().includes(modality.toUpperCase()))
      return -1;
    let s = 0;
    if (
      rec.header_coverage &&
      region &&
      rec.header_coverage.toLowerCase().includes(region.toLowerCase())
    ) s += 2;
    (rec.contexts || []).forEach((c) => {
      if (contexts.some((ctx) => ctx.toLowerCase() === (c || "").toLowerCase()))
        s += 2;
    });
    (rec.keywords || []).forEach((k) => {
      if (condition && condition.toLowerCase().includes((k || "").toLowerCase()))
        s += 2;
    });
    if (
      (rec.tags || []).includes("oncology-general") &&
      condition && /c\d\d|malig|tumor|cancer/i.test(condition)
    ) s += 1;
    return s;
  }

  function suggestStudies(modality, region, contexts, condition) {
    if (!els.suggestions) return;
    const recs = RULES?.records || [];
    const scored = recs
      .map((r) => ({ r, s: scoreRecord(r, modality, region, contexts, condition) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);

    els.suggestions.innerHTML = "";
    if (!scored.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No specific suggestions. Adjust context/condition.";
      els.suggestions.appendChild(li);
      return;
    }

    scored.forEach(({ r }) => {
      const li = document.createElement("li");
      const cpts = (r.cpt || []).join(", ");
      li.innerHTML = `<strong>${r.study_name || r.header_coverage || "Suggested study"}</strong> <span class="muted">${cpts ? "[" + cpts + "]" : ""}</span>`;
      li.title = (r.reasons || [])[0] || "";
      els.suggestions.appendChild(li);
    });
  }

  // -------- ICD-10 suggestions (lightweight helper) --------
  // NOTE: Verify final billing codes per ICD-10-CM and payer policy.
  const ICD_RULES = [
    // PET/CT oncology
    { tokens: ["dlbcl","lymphoma","hodgkin","nhl"], codes: [
      { code:"C83.30", label:"Diffuse large B-cell lymphoma, unspecified site" },
      { code:"C81.90", label:"Hodgkin lymphoma, unspecified, unspecified site" }
    ]},
    { tokens: ["nsclc","lung cancer","pulmonary nodule","lung"], codes: [
      { code:"C34.90", label:"Malignant neoplasm of unspecified part of unspecified lung" },
      { code:"R91.1",  label:"Solitary pulmonary nodule" }
    ]},
    { tokens: ["melanoma"], codes: [{ code:"C43.9", label:"Malignant melanoma of skin, unspecified" }]},
    { tokens: ["colorectal","colon cancer"], codes: [{ code:"C18.9", label:"Malignant neoplasm of colon, unspecified" }]},
    { tokens: ["hnscc","head and neck"], codes: [{ code:"C76.0", label:"Malignant neoplasm of head, face and neck" }]},
    { tokens: ["fever of unknown origin","fuo"], codes: [{ code:"R50.9", label:"Fever, unspecified" }]},
    { tokens: ["viability","ischemic cardiomyopathy","myocardial"], codes: [{ code:"I25.5", label:"Ischemic cardiomyopathy" }]},

    // CT common
    { tokens: ["pulmonary embolism","pe"], codes: [{ code:"I26.99", label:"Other pulmonary embolism without acute cor pulmonale" }]},
    { tokens: ["appendicitis","rlq"], codes: [{ code:"K35.80", label:"Unspecified acute appendicitis" }]},
    { tokens: ["renal colic","kidney stone","flank pain","hematuria"], codes: [
      { code:"N20.0", label:"Calculus of kidney" },
      { code:"N23",   label:"Unspecified renal colic" }
    ]},
    { tokens: ["pneumonia"], codes: [{ code:"J18.9", label:"Pneumonia, unspecified organism" }]},

    // MRI neuro
    { tokens: ["stroke","cerebral infarction"], codes: [{ code:"I63.9", label:"Cerebral infarction, unspecified" }]},
    { tokens: ["tia"], codes: [{ code:"G45.9", label:"Transient cerebral ischemic attack, unspecified" }]},
    { tokens: ["intracranial hemorrhage","ich"], codes: [{ code:"I62.9", label:"Nontraumatic intracranial hemorrhage, unspecified" }]},

    // MRI spine
    { tokens: ["cervical radiculopathy"], codes: [{ code:"M54.12", label:"Radiculopathy, cervical region" }]},
    { tokens: ["lumbar radiculopathy","sciatica"], codes: [{ code:"M54.16", label:"Radiculopathy, lumbar region" }]},
    { tokens: ["spinal stenosis","stenosis"], codes: [{ code:"M48.061", label:"Spinal stenosis, lumbar region w/o neurogenic claudication" }]},
    { tokens: ["disc herniation"], codes: [{ code:"M51.26", label:"Other intervertebral disc displacement, lumbar region" }]},

    // Ortho
    { tokens: ["meniscal tear"], codes: [{ code:"S83.209A", label:"Tear of unsp meniscus, unsp knee, initial encounter" }]},
    { tokens: ["acl tear"], codes: [{ code:"S83.511A", label:"Sprain of ACL of right knee, initial encounter" }]},
    { tokens: ["rotator cuff"], codes: [{ code:"M75.100", label:"Unspecified rotator cuff tear or rupture, not specified as traumatic" }]}
  ];

  function suggestICD10(text) {
    const t = (text || "").toLowerCase();
    const out = [];
    const seen = new Set();
    for (const rule of ICD_RULES) {
      if (rule.tokens.some(tok => t.includes(tok))) {
        for (const c of rule.codes) {
          if (!seen.has(c.code)) {
            out.push(c);
            seen.add(c.code);
          }
        }
      }
      if (out.length >= 6) break; // keep tidy
>>>>>>> 1a5762e (Order Helper: unify app.js (rules auto-merge + ICD-10) and align with updated index)
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
