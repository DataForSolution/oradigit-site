/**
 * OraDigit Order Helper – app.js (golden rev for steps 1–5)
 * - Auto-merges rules.json + ct_rules.json + mri_rules.json (respects ?v= cache-buster)
 * - Chips UI + keyboard support; mirrors to hidden <select multiple>
 * - CT contrast auto-suggestions
 * - Indication builder with {contrast_text}
 * - Study suggestions + Results panel + ICD-10 suggestions + improved copy-all
 * - Fallback rules so UI stays usable if JSON fetch fails
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
    context: document.getElementById("context"),
    contextChips: document.getElementById("contextChips"),
    condition: document.getElementById("condition"),
    conditionList: document.getElementById("conditionList"),
    indication: document.getElementById("indication"),
    contrastGroup: document.getElementById("contrastGroup"),
    oral: document.getElementById("oralContrast"),

    // Results area
    outHeader: document.getElementById("outHeader"),
    outReason: document.getElementById("outReason"),
    outPrep: document.getElementById("outPrep"),
    outDocs: document.getElementById("outDocs"),
    outFlags: document.getElementById("outFlags"),
    outICD: document.getElementById("outICD"),
    results: document.getElementById("results"),
    copyReasonBtn: document.getElementById("copyReasonBtn"),
    copyAllBtn: document.getElementById("copyAllBtn"),
    printBtn: document.getElementById("printBtn"),

    suggestions: document.getElementById("suggestions"),
    errMsg: document.getElementById("errMsg"),
    dbg: document.getElementById("dbg"),
  };

  // -------- Fallbacks (UI remains useful if rules fail) --------
  const FALLBACK_RULES = {
    modalities: {
      "PET/CT": {
        regions: [
          "Skull base to mid-thigh","Whole body","Head/Neck",
          "Chest","Abdomen/Pelvis","Brain","Cardiac viability"
        ],
        contexts: [
          "Staging","Restaging","Treatment response","Surveillance",
          "Suspected recurrence","Infection / inflammation","Viability"
        ],
        conditions: [
          "DLBCL","Hodgkin lymphoma","NSCLC","Melanoma","Colorectal cancer",
          "Head and neck SCC","Fever of unknown origin","Osteomyelitis","Cardiac viability"
        ],
        indication_templates: [
          "FDG PET/CT {region} – {context} for {condition}",
          "FDG PET/CT {region} – evaluate {condition}",
          "FDG PET/CT {region}{contrast_text} – {context} ({condition})"
        ]
      },
      CT: {
        regions: [
          "Head/Brain","Neck","Chest","Low-Dose Lung CT (Screening)",
          "Abdomen","Pelvis","Abdomen/Pelvis","CT Urogram",
          "Spine – Cervical","Spine – Thoracic","Spine – Lumbar"
        ],
        contexts: [
          "Staging","Restaging","Treatment response","Surveillance","Initial evaluation",
          "Acute symptoms","Follow-up","Pre-operative planning","Post-operative complication",
          "Trauma","Screening","Infection / inflammation"
        ],
        conditions: [
          "Pulmonary embolism","Lung nodule","Pneumonia complication","NSCLC",
          "Appendicitis","Renal colic","Abdominal pain RLQ","Stroke/TIA","Head trauma"
        ],
        indication_templates: [
          "CT {region}{contrast_text} – {context} for {condition}",
          "CT {region} – rule out {condition}",
          "CT {region}{contrast_text} – evaluate {condition}"
        ],
        contrast_recommendations: [
          { match:["kidney stone","renal colic"],        suggest:"without_iv" },
          { match:["appendicitis","rlq"],                suggest:"with_iv"    },
          { match:["pe","pulmonary embolism"],           suggest:"with_iv"    },
          { match:["aortic","dissection","aneurysm"],    suggest:"with_iv"    },
          { match:["liver lesion","pancreatitis"],       suggest:"with_iv"    },
          { match:["bowel obstruction"],                  suggest:"without_iv"},
          { match:["low-dose lung ct","screening","ldct"], suggest:"without_iv" }
        ]
      }
    },
    records: []
  };

  let RULES = null;

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
      const checked = els.contrastGroup.querySelector('input[type=radio]:checked');
      if (checked) checked.checked = false;
      if (els.oral) els.oral.checked = false;
    }
  }

  function contrastTextFromForm() {
    if (!els.contrastGroup || els.contrastGroup.classList.contains("hidden")) return "";
    const radio = els.contrastGroup.querySelector('input[type=radio]:checked');
    const oral = els.oral?.checked ? " + oral contrast" : "";
    if (!radio) return oral ? "(" + oral.trim() + ")" : "";
    if (radio.value === "with_iv")    return "(with IV contrast" + oral + ")";
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

  // -------- Rules loading: auto-merge PET/CT + CT + MRI --------
  async function loadRules() {
    function buildSiblingUrls(rulesUrl) {
      const meta = new URL(rulesUrl, location.origin);
      const search = meta.search; // keep ?v=...
      const dir = new URL(meta.pathname.replace(/[^/]+$/, ''), location.origin);
      const mk = (name) => new URL(name + search, dir).toString();
      return [
        rulesUrl,            // rules.json (PET/CT + general)
        mk("ct_rules.json"), // CT
        mk("mri_rules.json") // MRI
      ];
    }
    async function tryFetch(url) {
      try { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) return null; return await r.json(); }
      catch { return null; }
    }
    try {
      const urls = buildSiblingUrls(RULES_URL);
      const loaded = (await Promise.all(urls.map(tryFetch))).filter(Boolean);
      if (!loaded.length) throw new Error("No rules files available");

      RULES = { modalities: {}, records: [] };
      for (const j of loaded) {
        if (j.modalities && typeof j.modalities === "object") {
          Object.assign(RULES.modalities, j.modalities);
        }
        if (Array.isArray(j.records)) {
          RULES.records.push(...j.records);
        } else if (Array.isArray(j)) {
          // support legacy "pure records array" JSON files
          RULES.records.push(...j);
        }
      }
      if (!RULES.records.length && !Object.keys(RULES.modalities).length) {
        throw new Error("Invalid rules schema after merge");
      }
      setStatus("Rules loaded.", "success");
    } catch (e) {
      console.warn("Rules load/merge failed; using fallback", e);
      RULES = FALLBACK_RULES;
      setStatus("Using built-in fallback rules (could not fetch rules.json).", "warn");
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
    return {
      contexts: Array.from(setC),
      regions: Array.from(setR),
      conditions: []
    };
  }

  // -------- Populate UI for modality --------
  function populateForModality(modality) {
    const node = getModalityNode(modality) || deriveFromRecords(modality);

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

    // Notify preview helpers to re-render
    try { document.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
  }

  // -------- CT contrast suggestions --------
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
      const withIV = els.contrastGroup?.querySelector('input[type=radio][value="with_iv"]');
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

  // -------- Study suggestions --------
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

  // -------- ICD-10 suggestions (informational only) --------
  const ICD_RULES = [
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
    { tokens: ["pulmonary embolism","pe"], codes: [{ code:"I26.99", label:"Other pulmonary embolism without acute cor pulmonale" }]},
    { tokens: ["appendicitis","rlq"], codes: [{ code:"K35.80", label:"Unspecified acute appendicitis" }]},
    { tokens: ["renal colic","kidney stone","flank pain","hematuria"], codes: [
      { code:"N20.0", label:"Calculus of kidney" },
      { code:"N23",   label:"Unspecified renal colic" }
    ]},
    { tokens: ["pneumonia"], codes: [{ code:"J18.9", label:"Pneumonia, unspecified organism" }]},
    { tokens: ["stroke","cerebral infarction"], codes: [{ code:"I63.9", label:"Cerebral infarction, unspecified" }]},
    { tokens: ["tia"], codes: [{ code:"G45.9", label:"Transient cerebral ischemic attack, unspecified" }]},
    { tokens: ["intracranial hemorrhage","ich"], codes: [{ code:"I62.9", label:"Nontraumatic intracranial hemorrhage, unspecified" }]},
    { tokens: ["cervical radiculopathy"], codes: [{ code:"M54.12", label:"Radiculopathy, cervical region" }]},
    { tokens: ["lumbar radiculopathy","sciatica"], codes: [{ code:"M54.16", label:"Radiculopathy, lumbar region" }]},
    { tokens: ["spinal stenosis","stenosis"], codes: [{ code:"M48.061", label:"Spinal stenosis, lumbar region w/o neurogenic claudication" }]},
    { tokens: ["disc herniation"], codes: [{ code:"M51.26", label:"Other intervertebral disc displacement, lumbar region" }]},
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
          if (!seen.has(c.code)) { out.push(c); seen.add(c.code); }
        }
      }
      if (out.length >= 6) break;
    }
    return out;
  }

  // -------- Results panel fill --------
  function fillResults(topRec, contextStr, conditionStr) {
    if (!els.results || !topRec) return;
    const header = topRec.study_name || topRec.header_coverage || "Suggested Study";
    if (els.outHeader) {
      const cptStr = (topRec.cpt || []).join(", ");
      els.outHeader.textContent = cptStr ? `${header} — CPT: ${cptStr}` : header;
    }
    if (els.outReason) {
      const tmpl = (topRec.reasons || [])[0] || "{context} {condition}";
      els.outReason.value = tmpl
        .replace("{context}", contextStr || "")
        .replace("{condition}", conditionStr || "");
    }
    function fillUL(ul, arr) {
      if (!ul) return;
      ul.innerHTML = "";
      (arr || []).forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    }
    fillUL(els.outPrep,  topRec.prep ? [topRec.prep] : []);
    fillUL(els.outDocs,  topRec.supporting_docs);
    fillUL(els.outFlags, topRec.flags);

    if (els.outICD) {
      const icds = suggestICD10(`${contextStr || ""} ${conditionStr || ""}`);
      els.outICD.innerHTML = "";
      if (icds.length) {
        icds.forEach(({code,label}) => {
          const li = document.createElement("li");
          li.textContent = `${code} — ${label}`;
          els.outICD.appendChild(li);
        });
      } else {
        const li = document.createElement("li");
        li.className = "muted";
        li.textContent = "No suggestions. Edit condition text for better matches.";
        els.outICD.appendChild(li);
      }
    }
    els.results.hidden = false;
  }

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
        const m = els.modality?.value;
        buildIndication(getModalityNode(m) || (FALLBACK_RULES.modalities[m] || null), m);
      });
      els.condition?.addEventListener(evt, () => {
        if (els.modality?.value === "CT") {
          const node = getModalityNode("CT") || FALLBACK_RULES.modalities.CT;
          suggestContrastIfCT(node, els.condition?.value, els.region?.value);
        }
        const m = els.modality?.value;
        buildIndication(getModalityNode(m) || (FALLBACK_RULES.modalities[m] || null), m);
      });
    });

    // Contrast change -> rebuild indication
    els.contrastGroup?.addEventListener("change", () => {
      if (els.modality?.value === "CT") {
        buildIndication(getModalityNode("CT") || FALLBACK_RULES.modalities.CT, "CT");
      }
    });

    // Chips: click + keyboard toggle
    document.addEventListener("click", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      const cur = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", cur ? "false" : "true");
      mirrorChipsToHiddenSelect();
      const m = els.modality?.value;
      buildIndication(getModalityNode(m) || (FALLBACK_RULES.modalities[m] || null), m);
    });
    document.addEventListener("keydown", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); chip.click(); }
    });

    // Form submit -> suggest order + fill results
    els.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const modality = els.modality?.value || "";
      const region   = els.region?.value || "";
      const contexts = els.contextChips
        ? getSelectedContextsFromChips()
        : (els.context ? [...els.context.selectedOptions].map((o) => o.value) : []);
      const condition = els.condition?.value || "";

      suggestStudies(modality, region, contexts, condition);

      const recs = RULES?.records || [];
      const ranked = recs
        .map((r) => ({ r, s: scoreRecord(r, modality, region, contexts, condition) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s);
      fillResults(ranked[0]?.r, contexts.join(", "), condition);

      setStatus("Order suggested below. Review, copy, or print.", "success");
    });

    // Copy buttons
    els.copyReasonBtn?.addEventListener("click", async () => {
      const v = els.outReason?.value?.trim();
      if (!v) return;
      try { await navigator.clipboard.writeText(v); setStatus("Reason copied to clipboard.", "success"); }
      catch { setStatus("Unable to copy reason. Select and copy manually.", "warn"); }
    });

    els.copyAllBtn?.addEventListener("click", async () => {
      const parts = [];
      if (els.outHeader) parts.push(els.outHeader.textContent);
      if (els.outReason?.value) parts.push("Reason: " + els.outReason.value);
      if (els.outPrep?.children?.length)  parts.push("Prep: "  + Array.from(els.outPrep.children).map(li => li.textContent).join("; "));
      if (els.outDocs?.children?.length)  parts.push("Docs: "  + Array.from(els.outDocs.children).map(li => li.textContent).join("; "));
      if (els.outFlags?.children?.length) parts.push("Flags: " + Array.from(els.outFlags.children).map(li => li.textContent).join("; "));
      if (els.outICD?.children?.length)   parts.push("ICD-10: "+ Array.from(els.outICD.children).map(li => li.textContent).join("; "));
      const text = parts.join("\n");
      if (!text.trim()) return;
      try { await navigator.clipboard.writeText(text); setStatus("All details copied to clipboard.", "success"); }
      catch { setStatus("Unable to copy. Select and copy manually.", "warn"); }
    });

    els.printBtn?.addEventListener("click", () => window.print());
  }

  // -------- Init --------
  (async function init() {
    await loadRules();
    wireEvents();

    // Default modality (respect current selection)
    const current = els.modality?.value || "PET/CT";
    populateForModality(current);

    // Pre-run indication (and CT contrast if needed)
    if (current === "CT") {
      const node = getModalityNode("CT") || FALLBACK_RULES.modalities.CT;
      suggestContrastIfCT(node, els.condition?.value, els.region?.value);
      buildIndication(node, "CT");
    } else {
      const node = getModalityNode(current) || (FALLBACK_RULES.modalities[current] || null);
      buildIndication(node, current);
    }

    if (els.dbg) els.dbg.textContent = `[OH] Ready (${new Date().toLocaleString()})`;
  })();
})();

