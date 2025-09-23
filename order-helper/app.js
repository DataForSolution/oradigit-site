(() => {
  const qs = (s) => document.querySelector(s);
  const setStatus = (msg, cls = 'status success') => {
    const s = qs('#status'); if (s) { s.textContent = msg; s.className = cls; }
  };

  // Catch sync + async errors in one place
  window.addEventListener('error', e => setStatus('JavaScript error: ' + (e.message || 'Unknown'), 'status error'));
  window.addEventListener('unhandledrejection', e => setStatus('App error: ' + (e.reason?.message || e.reason || 'Unknown'), 'status error'));

﻿/**
 * OraDigit Order Helper – app.js (rev2)
 * - Solid fallback for PET/CT + CT
 * - Hardened rules loader with schema checks
 * - Chips UI with keyboard support, mirrors to hidden <select multiple>
 * - CT contrast auto-suggestions
 * - Indication builder + basic study suggestions
 */

(function () {
  "use strict";

  // -------- Config / Rules path --------
  const RULES_URL =
    document.querySelector('meta[name="oh-rules-path"]')?.content ||
    "./data/rules.json";

  // -------- Elements --------
  const els = {
    status: document.getElementById("status"),
    form: document.getElementById("orderForm"),
    modality: document.getElementById("modality"),
    region: document.getElementById("region"),
    context: document.getElementById("context"),           // hidden mirror select (optional)
    contextChips: document.getElementById("contextChips"), // primary UI
    condition: document.getElementById("condition"),
    conditionList: document.getElementById("conditionList"),
    indication: document.getElementById("indication"),
    contrastGroup: document.getElementById("contrastGroup"),
    oral: document.getElementById("oralContrast"),

    // Results area (optional on page)
    outHeader: document.getElementById("outHeader"),
    outReason: document.getElementById("outReason"),
    outPrep: document.getElementById("outPrep"),
    outDocs: document.getElementById("outDocs"),
    outFlags: document.getElementById("outFlags"),
    results: document.getElementById("results"),
    copyReasonBtn: document.getElementById("copyReasonBtn"),
    copyAllBtn: document.getElementById("copyAllBtn"),
    printBtn: document.getElementById("printBtn"),
    suggestions: document.getElementById("suggestions"),
    errMsg: document.getElementById("errMsg"),
    dbg: document.getElementById("dbg"),
  };

  // -------- Fallbacks (so UI still works if rules.json fails/empty) --------
  const FALLBACK_RULES = {
    modalities: {
      "PET/CT": {
        regions: [
          "Skull base to mid-thigh",
          "Whole body",
          "Head/Neck",
          "Chest",
          "Abdomen/Pelvis",
          "Cardiac viability"
        ],
        contexts: [
          "Staging","Restaging","Treatment response","Surveillance","Suspected recurrence","Infection / inflammation","Viability"
        ],
        conditions: [
          "DLBCL","Hodgkin lymphoma","NSCLC","Melanoma","Colorectal cancer",
          "Head and neck SCC","Fever of unknown origin","Cardiac viability"
        ],
        indication_templates: [
          "FDG PET/CT {region} – {context} for {condition}",
          "FDG PET/CT {region} – evaluate {condition}",
          "FDG PET/CT {region}{contrast_text} – {context} ({condition})"
        ]
      },
      CT: {
        regions: [
          "Head/Brain","Sinuses","Maxillofacial/Facial Bones","Temporal Bones/IAC","Neck","Chest",
          "Low-Dose Lung CT (Screening)","Abdomen","Pelvis","Abdomen/Pelvis","CT Urogram","CT Enterography",
          "Spine – Cervical","Spine – Thoracic","Spine – Lumbar","Upper Extremity","Lower Extremity",
          "Cardiac Coronary CTA","Angiography – Head/Neck CTA","Angiography – Chest CTA (PE)",
          "Angiography – Aorta CTA","Angiography – Run-off CTA (LE)"
        ],
        contexts: [
          "Staging","Restaging","Treatment response","Surveillance","Initial evaluation","Acute symptoms",
          "Follow-up","Pre-operative planning","Post-operative complication","Trauma","Screening","Infection / inflammation"
        ],
        conditions: [
          "Headache (sudden / thunderclap)","Head trauma","Stroke symptoms / TIA","Sinusitis","Neck mass",
          "Pulmonary embolism suspected","Aortic dissection / aneurysm suspected","Lung nodule","Pneumonia complication",
          "Abdominal pain RLQ (appendicitis)","Kidney stone / renal colic","Pancreatitis","Liver lesion characterization",
          "Diverticulitis","Inflammatory bowel disease flare","Bowel obstruction","Post-op abdomen","Hematuria",
          "Cancer staging (specify primary)","Metastatic disease restaging","Spine trauma","Cervical radiculopathy",
          "Spinal stenosis","Extremity fracture","Suspected osteomyelitis","Peripheral arterial disease (LE run-off)"
        ],
        indication_templates: [
          "CT {region} – {context} for {condition}",
          "CT {region} – rule out {condition}",
          "CT {region}{contrast_text} – {context} ({condition})"
        ],
        contrast_recommendations: [
          { match:["kidney stone","renal colic"], suggest:"without_iv" },
          { match:["appendicitis","rlq"], suggest:"with_iv" },
          { match:["pe","pulmonary embolism"], suggest:"with_iv" },
          { match:["aortic","dissection","aneurysm"], suggest:"with_iv" },
          { match:["liver lesion","pancreatitis"], suggest:"with_iv" },
          { match:["bowel obstruction"], suggest:"without_iv" },
          { match:["trauma"], suggest:"with_iv" },
          { match:["low-dose lung ct","screening"], suggest:"without_iv" }
        ]
      }
    },
    records: [] // keep empty; site-specific rules.json will populate
  };
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

  // -------- Utils --------
  function setStatus(msg, level = "info") {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className =
      "status " +
      (level === "ok" || level === "success"
        ? "success"
        : level === "warn"
        ? "warn"
        : level === "error"
        ? "error"
        : "");
  }

  const titleCase = (s) =>
    (s || "").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));

  function fillSelect(selectEl, values, placeholder = "Select…") {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    selectEl.appendChild(ph);
    (values || []).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    });
  }

  function fillDatalist(datalistEl, items) {
    if (!datalistEl) return;
    datalistEl.innerHTML = "";
    (items || []).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      datalistEl.appendChild(opt);
    });
  }

  function showContrast(show) {
    if (!els.contrastGroup) return;
    els.contrastGroup.classList.toggle("hidden", !show);
    if (!show) {
      const checked =
        els.contrastGroup.querySelector('input[type=radio]:checked');
      if (checked) checked.checked = false;
      if (els.oral) els.oral.checked = false;
    }
  }

  function contrastTextFromForm() {
    if (!els.contrastGroup || els.contrastGroup.classList.contains("hidden"))
      return "";
    const radio = els.contrastGroup.querySelector('input[type=radio]:checked');
    const oral = els.oral?.checked ? " + oral contrast" : "";
    if (!radio) return oral ? "(" + oral.trim() + ")" : "";
    if (radio.value === "with_iv") return "(with IV contrast" + oral + ")";
    if (radio.value === "without_iv") return "(without IV contrast" + oral + ")";
    return oral ? "(" + oral.trim() + ")" : "";
  }

  // -------- Chips helpers (with keyboard support) --------
  function renderContextChips(contexts) {
    if (!els.contextChips) return;
    els.contextChips.innerHTML = "";
    (contexts || []).forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "oh-chip";
      btn.textContent = label;
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", `Toggle context ${label}`);
      btn.setAttribute("tabindex", "0");
      els.contextChips.appendChild(btn);
    });
  }

  function getSelectedContextsFromChips() {
    if (!els.contextChips) return [];
    return Array.from(
      els.contextChips.querySelectorAll('.oh-chip[aria-pressed="true"]')
    )
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean);
  }

  function mirrorChipsToHiddenSelect() {
    if (!els.context) return;
    const selected = getSelectedContextsFromChips();
    els.context.innerHTML = "";
    selected.forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      opt.selected = true;
      els.context.appendChild(opt);
    });
  }

  // -------- Rules loading --------
  function looksLikeRules(obj) {
    // Minimal sanity check
    if (!obj || typeof obj !== "object") return false;
    // accept either {modalities:{}} or at least records:[]
    const hasModalities =
      obj.modalities && typeof obj.modalities === "object";
    const hasRecords = Array.isArray(obj.records);
    return hasModalities || hasRecords;
  }

  async function loadRules() {
    try {
      const res = await fetch(RULES_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!looksLikeRules(json)) throw new Error("Invalid rules schema");
      RULES = json;
      setStatus("Rules loaded.", "success");
    } catch (e) {
      console.warn("Failed to load rules.json, using fallback", e);
      RULES = FALLBACK_RULES;
      setStatus(
        "Using built-in fallback rules (could not fetch rules.json).",
        "warn"
      );
    }
  }

  function getModalityNode(modality) {
    return RULES?.modalities?.[modality] || null;
  }

  // If no modalities entry, derive contexts/regions from records (best effort)
  function deriveFromRecords(modality) {
    const recs = (RULES?.records || []).filter((r) =>
      (r.modality || "").toUpperCase().includes(modality.toUpperCase())
    );
    const setC = new Set();
    const setR = new Set();
    recs.forEach((r) => {
      (r.contexts || []).forEach((c) => setC.add(titleCase(c)));
      if (r.header_coverage) setR.add(r.header_coverage);
    });
>>>>>>> d058311 (Update Order Helper: fix context preview and improve app.js rules handling)
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

  // -------- Populate UI for modality --------
  function populateForModality(modality) {
    const node = getModalityNode(modality) || deriveFromRecords(modality);

    fillSelect(els.region, node.regions || [], "Select region…");
    function renderForMod(mod) {
      const spec = cat.modalities[mod] || { regions: [], contexts: [], conditions: [] };


      // Regions
      clear(regionSel);
      regionSel.append(makeOpt('', 'Select region…'));
      (spec.regions || []).forEach(r => regionSel.append(makeOpt(r)));

    fillDatalist(els.conditionList, node.conditions || []);
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

    // Reset textual fields
    if (els.condition) els.condition.value = "";
    if (els.indication) els.indication.value = "";

    // Ask any external preview sync to re-render
    try {
      document.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {}
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
          return sel
            ? [...sel.selectedOptions].map((o) => o.textContent.trim()).join(", ")
            : "";
        })();
    const condition = els.condition?.value || "";
    const contrast_text = contrastTextFromForm(); // e.g., "(with IV contrast + oral contrast)"
    const templates =
      modalityNode?.indication_templates ||
      (modality === "CT"
        ? ["CT {region} – {context} for {condition}"]
        : modality === "PET/CT"
        ? ["FDG PET/CT {region} – {context} for {condition}"]
        : ["{region} – {context} for {condition}"]);
    // Prefer a template that includes {contrast_text} if present
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
    )
      s += 2;
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
      condition &&
      /c\d\d|malig|tumor|cancer/i.test(condition)
    )
      s += 1;
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

  // -------- Results panel fill --------
  function fillResults(topRec, contextStr, conditionStr) {
    if (!els.results || !topRec) return;
    const header =
      topRec.study_name || topRec.header_coverage || "Suggested Study";
    if (els.outHeader)
      els.outHeader.textContent = `${header} — CPT: ${(topRec.cpt || []).join(
        ", "
      )}`;

    if (els.outReason) {
      const tmpl = (topRec.reasons || [])[0] || "{context} {condition}";
      els.outReason.value = tmpl
        .replace("{context}", contextStr || "")
        .replace("{condition}", conditionStr || "");
    }

    function fillUL(ul, arr) {
      if (!ul) return;
      ul.innerHTML = "";
      (arr || []).forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
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

  // -------- Event wiring --------
  function wireEvents() {
    // Modality change -> repopulate
    els.modality?.addEventListener("change", () => {
      const modality = els.modality.value;
      populateForModality(modality);
      const node = getModalityNode(modality) || (FALLBACK_RULES.modalities[modality] || null);
      buildIndication(node, modality);
    });

    // Region / Condition input -> suggest contrast if CT and rebuild indication
    ["change", "input"].forEach((evt) => {
      els.region?.addEventListener(evt, () => {
        if (els.modality?.value === "CT") {
          const node = getModalityNode("CT") || FALLBACK_RULES.modalities.CT;
          suggestContrastIfCT(node, els.condition?.value, els.region?.value);
        }
        buildIndication(getModalityNode(els.modality?.value) || (FALLBACK_RULES.modalities[els.modality?.value] || null), els.modality?.value);
      });
      els.condition?.addEventListener(evt, () => {
        if (els.modality?.value === "CT") {
          const node = getModalityNode("CT") || FALLBACK_RULES.modalities.CT;
          suggestContrastIfCT(node, els.condition?.value, els.region?.value);
        }
        buildIndication(getModalityNode(els.modality?.value) || (FALLBACK_RULES.modalities[els.modality?.value] || null), els.modality?.value);
      });
    });

    // Contrast change -> rebuild indication
    els.contrastGroup?.addEventListener("change", () => {
      if (els.modality?.value === "CT") {
        buildIndication(
          getModalityNode("CT") || FALLBACK_RULES.modalities.CT,
          "CT"
        );
      }
    });

    // Chips: click + keyboard toggle
    document.addEventListener("click", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      const cur = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", cur ? "false" : "true");
      mirrorChipsToHiddenSelect();
      buildIndication(getModalityNode(els.modality?.value) || (FALLBACK_RULES.modalities[els.modality?.value] || null), els.modality?.value);
    });
    document.addEventListener("keydown", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        chip.click();
      }
    });

    // Form submit -> suggest order + fill results
    els.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const modality = els.modality?.value || "";
      const region = els.region?.value || "";
      const contexts = els.contextChips
        ? getSelectedContextsFromChips()
        : els.context
        ? [...els.context.selectedOptions].map((o) => o.value)
        : [];
      const condition = els.condition?.value || "";

      // Suggestions
      suggestStudies(modality, region, contexts, condition);

      // Fill results with top hit if available
      const recs = RULES?.records || [];
      const ranked = recs
        .map((r) => ({ r, s: scoreRecord(r, modality, region, contexts, condition) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s);
      fillResults(ranked[0]?.r, contexts.join(", "), condition);

      // Status message
      setStatus("Order suggested below. Review, copy, or print.", "success");
    });

    // Copy buttons
    els.copyReasonBtn?.addEventListener("click", async () => {
      const v = els.outReason?.value?.trim();
      if (!v) return;
      try {
        await navigator.clipboard.writeText(v);
        setStatus("Reason copied to clipboard.", "success");
      } catch {
        setStatus("Unable to copy reason. Select and copy manually.", "warn");
      }
    });

    els.copyAllBtn?.addEventListener("click", async () => {
      const parts = [];
      if (els.outHeader) parts.push(els.outHeader.textContent);
      if (els.outReason?.value) parts.push("Reason: " + els.outReason.value);
      if (els.outPrep?.children?.length)
        parts.push(
          "Prep: " +
            Array.from(els.outPrep.children)
              .map((li) => li.textContent)
              .join("; ")
        );
      if (els.outDocs?.children?.length)
        parts.push(
          "Docs: " +
            Array.from(els.outDocs.children)
              .map((li) => li.textContent)
              .join("; ")
        );
      if (els.outFlags?.children?.length)
        parts.push(
          "Flags: " +
            Array.from(els.outFlags.children)
              .map((li) => li.textContent)
              .join("; ")
        );
      const text = parts.join("\n");
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus("All details copied to clipboard.", "success");
      } catch {
        setStatus("Unable to copy. Select and copy manually.", "warn");
      }
    });

    els.printBtn?.addEventListener("click", () => window.print());
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

      const node =
        getModalityNode(current) || (FALLBACK_RULES.modalities[current] || null);
      buildIndication(node, current);
    }

    if (els.dbg)
      els.dbg.textContent = `[OH] Ready (${new Date().toLocaleString()})`;
  })();
})();

/* ===== OH loader shim (non-destructive) ===== */
(() => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  function init() {
    window.OH = window.OH || {};
    const $ = (s) => document.querySelector(s);
    const setText = (el, msg) => { if (el) el.textContent = msg; };

    const els = {
      status:     $('#status'),
      modality:   $('#modality'),
      region:     $('#region'),
      bodyPart:   $('#bodyPart'),
      contrast:   $('#contrast'),
      laterality: $('#laterality'),
      context:    $('#context'),
    };

    const RULES_URL =
      document.querySelector('meta[name="oh-rules-path"]')?.content ||
      '/order-helper/data/rules.json';

    const FALLBACK = Object.freeze({
      schema_version: '1.1',
      modalities: {
        'PET/CT': {
          regions:    ['Skull base to mid-thigh', 'Whole body'],
          body_parts: ['Head/Neck', 'Chest', 'Abdomen/Pelvis'],
          contrast:   ['None'],
          laterality: ['N/A'],
          contexts:   ['Staging','Restaging','Treatment response','Surveillance','Acute'],
        },
        'CT': {
          regions:    ['Head/Brain','Chest','Abdomen/Pelvis'],
          body_parts: ['Head','Chest','Abdomen','Pelvis'],
          contrast:   ['None','IV','Oral','IV + Oral'],
          laterality: ['N/A','Right','Left','Bilateral'],
          contexts:   ['Acute','Follow-up','Staging'],
        },
        'MRI': {
          regions:    ['Brain','Spine','MSK'],
          body_parts: ['Brain','Cervical','Lumbar','Hip'],
          contrast:   ['None','Gadolinium'],
          laterality: ['N/A','Right','Left','Bilateral'],
          contexts:   ['Acute','Follow-up','Staging'],
        }
      }
    });

    const validate = (cat) => !!(cat && typeof cat === 'object' && cat.modalities && typeof cat.modalities === 'object');

    function setOptions(selectEl, items, placeholder) {
      if (!selectEl) return;
      const list = Array.isArray(items) ? items : [];
      selectEl.innerHTML = '';
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = placeholder || 'Select…';
      ph.disabled = true; ph.selected = true;
      selectEl.appendChild(ph);
      for (const v of list) {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        selectEl.appendChild(opt);
      }
    }

    function bindCascades(cat) {
      if (!els.modality) return;
      const modalities = Object.keys(cat.modalities || {});
      setOptions(els.modality, modalities, 'Select modality…');

      els.modality.addEventListener('change', () => {
        const m = els.modality.value;
        const spec = (cat.modalities || {})[m] || {};
        setOptions(els.region,     spec.regions,     'Select region…');
        setOptions(els.bodyPart,   spec.body_parts,  'Select body part…');
        setOptions(els.contrast,   spec.contrast,    'Select contrast…');
        setOptions(els.laterality, spec.laterality,  'Select laterality…');
        setOptions(els.context,    spec.contexts,    'Select context…');
      });

      // optional: auto-select the first modality to avoid empty UI
      if (els.modality.options.length > 1) {
        els.modality.selectedIndex = 1;
        els.modality.dispatchEvent(new Event('change'));
      }
    }

    async function loadCatalog() {
      setText(els.status, 'Loading rules…');
      try {
        const res = await fetch(RULES_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!validate(json)) throw new Error('Invalid rules schema');
        setText(els.status, 'Rules loaded.');
        return json;
      } catch (err) {
        console.warn('[OH] rules load failed, using fallback:', err);
        setText(els.status, 'Using built-in defaults (rules.json unavailable).');
        return FALLBACK;
      }
    }

    window.OH.loadCatalog = loadCatalog;

    loadCatalog().then(cat => {
      window.OH.catalog = cat;
      bindCascades(cat);
      document.dispatchEvent(new CustomEvent('oh:catalog-ready', { detail: { catalog: cat } }));
    });
  }
})();
