/**
<<<<<<< HEAD
 * OraDigit Order Helper – app.js (golden rev w/ built-in preview sync)
 * - Fallback PET/CT + CT modalities
=======
 * OraDigit Order Helper – app.js
 * - PET/CT + CT + MRI supported
>>>>>>> 47d41e0 (OH: switch to data/ (case fix); update index + app (live preview & loader))
 * - Hardened rules loader with schema checks
 * - Chips UI with keyboard support, mirrors to hidden <select multiple>
 * - CT contrast auto-suggestions
 * - Indication builder + basic study suggestions
<<<<<<< HEAD
 * - NEW: syncPreviewPanel() updates the right-side preview (no inline script needed)
=======
 * - Live Order Preview sync (right pane)
>>>>>>> 47d41e0 (OH: switch to data/ (case fix); update index + app (live preview & loader))
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
    outICD: document.getElementById("outICD"),
    results: document.getElementById("results"),
    copyReasonBtn: document.getElementById("copyReasonBtn"),
    copyAllBtn: document.getElementById("copyAllBtn"),
    printBtn: document.getElementById("printBtn"),
    suggestions: document.getElementById("suggestions"),
    errMsg: document.getElementById("errMsg"),
    dbg: document.getElementById("dbg"),

    // Preview panel (right side)
    pvModality: document.getElementById("pv-modality"),
    pvRegion: document.getElementById("pv-region"),
    pvContext: document.getElementById("pv-context"),
    pvCondition: document.getElementById("pv-condition"),
    pvContrast: document.getElementById("pv-contrast"),
    pvIndication: document.getElementById("pv-indication"),
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
      },
      MRI: {
        regions: ["Brain"],
        contexts: ["Oncology","Neuro","Infection","Inflammation","Seizure"],
        conditions: ["Glioma","GBM","Brain metastases","Seizure","Abscess","Encephalitis","MS"],
        indication_templates: [
          "MRI {region} – {context} for {condition}",
          "MRI {region}{contrast_text} – {context} ({condition})"
        ]
      }
    },
    records: [] // site rules.json will populate these
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
    const hasModalities = obj.modalities && typeof obj.modalities === "object";
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
    return {
      contexts: Array.from(setC),
      regions: Array.from(setR),
      conditions: [] // leave empty; user types
    };
  }

  // -------- NEW: Preview sync --------
  function getContrastPreviewText() {
    if (!els.contrastGroup || els.contrastGroup.classList.contains("hidden")) return "—";
    const r = els.contrastGroup.querySelector('input[type=radio]:checked');
    const oral = !!els.oral?.checked;
    let txt = "—";
    if (r) txt = r.value === "with_iv" ? "With IV contrast" : "Without IV contrast";
    if (oral) txt = (txt === "—" ? "" : txt) + (txt === "—" ? "Oral contrast" : " + oral");
    return txt;
  }

  function selectedContexts() {
    return els.contextChips
      ? getSelectedContextsFromChips()
      : (els.context ? [...els.context.selectedOptions].map(o => o.value) : []);
  }

  function syncPreviewPanel() {
    try {
      if (els.pvModality)  els.pvModality.textContent  = els.modality?.value || "—";
      if (els.pvRegion)    els.pvRegion.textContent    = els.region?.value || "—";
      if (els.pvContext)   els.pvContext.textContent   = (selectedContexts().join(", ")) || "—";
      if (els.pvCondition) els.pvCondition.textContent = els.condition?.value || "—";
      if (els.pvContrast)  els.pvContrast.textContent  = getContrastPreviewText();
      if (els.pvIndication)els.pvIndication.textContent= (els.indication?.value || "").trim() || "—";
    } catch (e) {
      console.warn("Preview sync error:", e);
    }
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

    // Re-sync preview after repopulation
    syncPreviewPanel();
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
    syncPreviewPanel();
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

    // keep preview current
    syncPreviewPanel();
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
    }
    fillUL(els.outPrep, topRec.prep ? [topRec.prep] : []);
    fillUL(els.outDocs, topRec.supporting_docs);
    fillUL(els.outFlags, topRec.flags);
    fillUL(els.outICD, topRec.icd10 || []);

    els.results.hidden = false;
  }

  // ---- Preview sync (right pane) ----
  function setPV(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = (text && String(text).trim()) || '—';
  }
  function syncPreviewNow() {
    setPV('pv-modality', els.modality?.value);
    setPV('pv-region',   els.region?.value);

    const contexts = els.contextChips
      ? getSelectedContextsFromChips()
      : (els.context ? [...els.context.selectedOptions].map(o => o.value) : []);
    setPV('pv-context', contexts.length ? contexts.join(', ') : '');

    setPV('pv-condition', els.condition?.value);

    let cTxt = '';
    if (els.contrastGroup && !els.contrastGroup.classList.contains('hidden')) {
      const r = els.contrastGroup.querySelector('input[type=radio]:checked');
      const oral = els.oral?.checked;
      if (r) cTxt = (r.value === 'with_iv') ? 'With IV contrast' : 'Without IV contrast';
      if (oral) cTxt = (cTxt ? cTxt + ' + oral' : 'Oral contrast');
    }
    setPV('pv-contrast', cTxt);

    const pre = document.getElementById('pv-indication');
    if (pre) pre.textContent = (els.indication?.value || '').trim() || '—';
  }

  // -------- Event wiring --------
  function wireEvents() {
    // Modality change -> repopulate
    els.modality?.addEventListener("change", () => {
      const modality = els.modality.value;
      populateForModality(modality);
      const node = getModalityNode(modality) || (FALLBACK_RULES.modalities[modality] || null);
      buildIndication(node, modality);
<<<<<<< HEAD
      syncPreviewPanel();
=======
      syncPreviewNow();
>>>>>>> 47d41e0 (OH: switch to data/ (case fix); update index + app (live preview & loader))
    });

    // Region / Condition input -> suggest contrast if CT and rebuild indication
    ["change", "input"].forEach((evt) => {
      els.region?.addEventListener(evt, () => {
        if (els.modality?.value === "CT") {
          const node = getModalityNode("CT") || FALLBACK_RULES.modalities.CT;
          suggestContrastIfCT(node, els.condition?.value, els.region?.value);
        }
        buildIndication(getModalityNode(els.modality?.value) || (FALLBACK_RULES.modalities[els.modality?.value] || null), els.modality?.value);
<<<<<<< HEAD
        syncPreviewPanel();
=======
        syncPreviewNow();
>>>>>>> 47d41e0 (OH: switch to data/ (case fix); update index + app (live preview & loader))
      });
      els.condition?.addEventListener(evt, () => {
        if (els.modality?.value === "CT") {
          const node = getModalityNode("CT") || FALLBACK_RULES.modalities.CT;
          suggestContrastIfCT(node, els.condition?.value, els.region?.value);
        }
        buildIndication(getModalityNode(els.modality?.value) || (FALLBACK_RULES.modalities[els.modality?.value] || null), els.modality?.value);
<<<<<<< HEAD
        syncPreviewPanel();
=======
        syncPreviewNow();
>>>>>>> 47d41e0 (OH: switch to data/ (case fix); update index + app (live preview & loader))
      });
    });

    // Contrast change -> rebuild indication + preview
    els.contrastGroup?.addEventListener("change", () => {
      if (els.modality?.value === "CT") {
        buildIndication(getModalityNode("CT") || FALLBACK_RULES.modalities.CT, "CT");
        syncPreviewNow();
      }
      syncPreviewPanel();
    });

    // Chips: click + keyboard toggle
    document.addEventListener("click", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      const cur = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", cur ? "false" : "true");
      mirrorChipsToHiddenSelect();
      buildIndication(getModalityNode(els.modality?.value) || (FALLBACK_RULES.modalities[els.modality?.value] || null), els.modality?.value);
<<<<<<< HEAD
      syncPreviewPanel();
=======
      syncPreviewNow();
>>>>>>> 47d41e0 (OH: switch to data/ (case fix); update index + app (live preview & loader))
    });
    document.addEventListener("keydown", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        chip.click();
      }
    });

    // Form submit -> suggest order + fill results (preview already synced)
    els.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const modality = els.modality?.value || "";
      const region = els.region?.value || "";
      const contexts = selectedContexts();
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
      syncPreviewNow();
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
        parts.push("Prep: " + Array.from(els.outPrep.children).map((li) => li.textContent).join("; "));
      if (els.outDocs?.children?.length)
        parts.push("Docs: " + Array.from(els.outDocs.children).map((li) => li.textContent).join("; "));
      if (els.outFlags?.children?.length)
        parts.push("Flags: " + Array.from(els.outFlags.children).map((li) => li.textContent).join("; "));
      if (els.outICD?.children?.length)
        parts.push("ICD-10: " + Array.from(els.outICD.children).map((li) => li.textContent).join("; "));

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

  // -------- Init --------
  (async function init() {
    await loadRules();
    wireEvents();

    // Default modality (respect current selection)
    const current = els.modality?.value || "PET/CT";
    populateForModality(current);

    // If CT selected at load, pre-run contrast suggestion
    if (current === "CT") {
      const node = getModalityNode("CT") || FALLBACK_RULES.modalities.CT;
      suggestContrastIfCT(node, els.condition?.value, els.region?.value);
      buildIndication(node, "CT");
    } else {
      const node = getModalityNode(current) || (FALLBACK_RULES.modalities[current] || null);
      buildIndication(node, current);
    }

<<<<<<< HEAD
    // Final: make sure preview shows current form state
    syncPreviewPanel();
=======
    syncPreviewNow();
>>>>>>> 47d41e0 (OH: switch to data/ (case fix); update index + app (live preview & loader))

    if (els.dbg)
      els.dbg.textContent = `[OH] Ready (${new Date().toLocaleString()})`;
  })();
})();
