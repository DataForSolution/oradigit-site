// order-helper/app.js  (Firestore-only, robust normalize, rev7)
(() => {
  const qs = (s) => document.querySelector(s);
  const setStatus = (msg, cls = "status success") => {
    const s = qs("#status");
    if (s) { s.textContent = msg; s.className = cls; }
  };

  // Surface runtime errors in the status bar
  window.addEventListener("error", (e) =>
    setStatus("JavaScript error: " + (e.message || "Unknown"), "status error")
  );
  window.addEventListener("unhandledrejection", (e) =>
    setStatus("App error: " + (e.reason?.message || e.reason || "Unknown"), "status error")
  );

  /**
   * OraDigit Order Helper – Firestore-only frontend
   * - Loads rules from /published_rules/{modality}/records
   * - Normalizes varying shapes (region/regions/study_name/header_coverage)
   * - Populates Region / Context / Condition suggestions
   */

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
    dbg: document.getElementById("dbg"),
  };

  // Map UI modality value -> Firestore doc id
  const MODALITY_MAP = {
    "PET/CT": "PET_CT",
    "CT": "CT",
    "MRI": "MRI",
    "X-Ray": "X_Ray",
    "Ultrasound": "Ultrasound",
    "Mammography": "Mammography",
    "Nuclear Medicine": "Nuclear_Medicine"
  };

  // Defaults used if a record doesn’t list contexts
  const DEFAULT_CONTEXTS = {
    "PET/CT": ["Staging", "Restaging", "Treatment response", "Surveillance", "Suspected recurrence", "Infection"],
    "CT": ["Acute", "Follow-up", "Oncology staging", "Trauma", "Screening", "Infection/inflammation"],
    "MRI": ["Acute", "Problem solving", "Follow-up", "Staging", "Restaging", "Surveillance"],
    "X-Ray": ["Acute", "Trauma", "Follow-up", "Infection"],
    "Ultrasound": ["Acute", "Screening", "Surveillance", "Follow-up"],
    "Mammography": ["Screening", "Diagnostic"],
    "Nuclear Medicine": ["Staging", "Evaluation", "Follow-up"]
  };

  // Fallback if Firestore is unavailable (kept tiny on purpose)
  const FALLBACK_RULES = {
    modalities: {
      "PET/CT": { regions: ["Skull base to mid-thigh"], contexts: DEFAULT_CONTEXTS["PET/CT"], conditions: ["NSCLC", "Lymphoma"] },
      "CT":    { regions: ["Head/Brain"],               contexts: DEFAULT_CONTEXTS["CT"],     conditions: ["PE", "Renal colic"] },
      "MRI":   { regions: ["Brain"],                    contexts: DEFAULT_CONTEXTS["MRI"],    conditions: ["MS"] }
    },
    records: []
  };

  // ------------- Normalization helpers -------------
  const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const clean = (arr) => [...new Set((arr || []).map(x => (x || "").toString().trim()).filter(Boolean))];

  function guessRegion(rec) {
    // Prefer explicit region
    if (rec.region && typeof rec.region === "string") return rec.region.trim();
    // Some records might have regions: []
    if (Array.isArray(rec.regions) && rec.regions.length) return rec.regions[0];
    // Fall back to header_coverage (e.g., "Skull base → mid-thigh")
    if (rec.header_coverage) return rec.header_coverage.toString().trim();
    // Try parsing from study_name: "FDG PET/CT — Skull Base to Mid-Thigh"
    if (rec.study_name && rec.study_name.includes("—")) {
      const t = rec.study_name.split("—").pop().trim();
      if (t && t.length < 120) return t;
    }
    return null;
  }

  function normalizeContexts(rec, modalityLabel) {
    const fromDoc = clean(rec.contexts);
    if (fromDoc.length) return fromDoc;
    // Some authors may place context-like words in tags/keywords
    const derived = clean([...(rec.tags || []), ...(rec.keywords || [])])
      .filter(w => /staging|restaging|surveillance|treatment|acute|follow|infection|diagnostic|screening/i.test(w));
    if (derived.length) return derived;
    return DEFAULT_CONTEXTS[modalityLabel] || [];
  }

  function normalizeConditions(rec) {
    // Prefer explicit conditions, then keywords, then tags
    const cand = clean([...(rec.conditions || []), ...(rec.keywords || []), ...(rec.tags || [])]);
    return cand;
  }

  function normalizeRecord(raw, modalityLabel) {
    return {
      id: raw.id || "",
      modality: modalityLabel,
      region: guessRegion(raw) || "General",
      contexts: normalizeContexts(raw, modalityLabel),
      conditions: normalizeConditions(raw),
      // Keep references around for future features
      study_name: raw.study_name || "",
      header_coverage: raw.header_coverage || "",
      prep_notes: clean(raw.prep_notes),
      supporting_docs: clean(raw.supporting_docs),
      flags: clean(raw.flags),
      reason_templates: clean(raw.reasons)
    };
  }

  // ------------- Firestore load -------------
  async function loadRulesFromFirestore() {
    const db = (window.OH_FIREBASE && window.OH_FIREBASE.db) || (window.firebase && window.firebase.firestore && window.firebase.firestore());
    if (!db) throw new Error("Firebase Firestore not initialized. Check index loader.");

    const out = { modalities: {}, records: [] };

    for (const [label, path] of Object.entries(MODALITY_MAP)) {
      try {
        const colRef = db.collection("published_rules").doc(path).collection("records");
        const snap = await colRef.get();
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        console.log(`[OH] ${label} records: ${docs.length}`, docs.map(d => d.id));

        const normalized = docs.map(r => normalizeRecord(r, label));
        out.records.push(...normalized);

        // Aggregate unique lists for UI
        const regions = new Set();
        const contexts = new Set();
        const conditions = new Set();

        normalized.forEach(r => {
          if (r.region) regions.add(r.region);
          (r.contexts || []).forEach(c => contexts.add(c));
          (r.conditions || []).forEach(c => conditions.add(c));
        });

        // Ensure we always have at least defaults for contexts
        const contextsList = [...contexts];
        const ensuredContexts = contextsList.length ? contextsList : (DEFAULT_CONTEXTS[label] || []);

        out.modalities[label] = {
          regions: [...regions],
          contexts: ensuredContexts,
          conditions: [...conditions]
        };
      } catch (err) {
        console.warn(`[OH] Failed to load ${label} rules`, err);
      }
    }

    if (!Object.keys(out.modalities).length) {
      setStatus("No Firestore rules found, using fallback", "status warn");
      return FALLBACK_RULES;
    }

    return out;
  }

  // ------------- UI build -------------
  function buildUI(cat) {
    renderForMod(cat, els.modality?.value || "PET/CT");
  }

  function renderForMod(cat, modality) {
    const spec = cat.modalities[modality] || { regions: [], contexts: [], conditions: [] };

    // Regions
    fillSelect(els.region, spec.regions, "Select region…");

    // Contexts -> chips
    renderContextChips(spec.contexts);

    // Conditions -> datalist
    // Use both conditions and “keywords-like” terms collected earlier
    fillDatalist(els.conditionList, spec.conditions);

    // CT contrast visibility
    showContrast(modality === "CT");

    syncPreview();
  }

  function fillSelect(selectEl, values, placeholder) {
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

  function fillDatalist(dl, items) {
    if (!dl) return;
    dl.innerHTML = "";
    (items || []).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      dl.appendChild(opt);
    });
  }

  function renderContextChips(contexts) {
    if (!els.contextChips) return;
    els.contextChips.innerHTML = "";
    (contexts || []).forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "oh-chip";
      btn.textContent = label;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        const on = btn.getAttribute("aria-pressed") === "true";
        btn.setAttribute("aria-pressed", on ? "false" : "true");
        mirrorChipsToHiddenSelect();
        syncPreview();
      });
      els.contextChips.appendChild(btn);
    });
    // Keep hidden <select> in sync on render
    mirrorChipsToHiddenSelect();
  }

  function mirrorChipsToHiddenSelect() {
    if (!els.context) return;
    const chips = [...els.contextChips.querySelectorAll('.oh-chip[aria-pressed="true"]')].map((c) => c.textContent.trim());
    els.context.innerHTML = "";
    chips.forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      opt.selected = true;
      els.context.appendChild(opt);
    });
  }

  function showContrast(show) {
    if (!els.contrastGroup) return;
    els.contrastGroup.classList.toggle("hidden", !show);
  }

  function syncPreview() {
    qs("#pv-modality").textContent = els.modality?.value || "—";
    qs("#pv-region").textContent = els.region?.value || "—";
    const ctx = [...els.context.selectedOptions].map((o) => o.value);
    qs("#pv-context").textContent = ctx.length ? ctx.join(", ") : "—";
    qs("#pv-condition").textContent = els.condition?.value || "—";
    qs("#pv-indication").textContent = els.indication?.value || "—";
  }

  // ------------- UX wiring -------------
  function wireEvents() {
    els.modality?.addEventListener("change", () => {
      renderForMod(RULES, els.modality.value);
    });

    ["change", "input"].forEach((evt) => {
      els.region?.addEventListener(evt, syncPreview);
      els.condition?.addEventListener(evt, syncPreview);
    });

    els.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      suggestStudies();
    });

    // Copy Clinical Indication
    qs("#copyIndication")?.addEventListener("click", async () => {
      const txt = els.indication?.value?.trim();
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        setStatus("Clinical indication copied.", "status success");
      } catch {
        setStatus("Unable to copy. Please copy manually.", "status warn");
      }
    });

    // Copy Reason
    els.copyReasonBtn?.addEventListener("click", async () => {
      const v = els.outReason?.value?.trim();
      if (!v) return;
      try {
        await navigator.clipboard.writeText(v);
        setStatus("Reason copied.", "status success");
      } catch {
        setStatus("Unable to copy reason.", "status warn");
      }
    });

    // Copy All
    els.copyAllBtn?.addEventListener("click", async () => {
      const parts = [];
      if (els.outHeader) parts.push(els.outHeader.textContent);
      if (els.outReason?.value) parts.push("Reason: " + els.outReason.value);
      const text = parts.join("\n");
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus("All details copied.", "status success");
      } catch {
        setStatus("Unable to copy all.", "status warn");
      }
    });

    // Print
    els.printBtn?.addEventListener("click", () => window.print());
  }

  // Simple placeholder to keep current UX
  function suggestStudies() {
    const modality  = els.modality?.value || "";
    const region    = els.region?.value || "";
    const ctx       = [...els.context.selectedOptions].map((o) => o.value);
    const condition = els.condition?.value || "";
    els.suggestions.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = `${modality} ${region} ${ctx.join(", ")} ${condition}`.replace(/\s+/g, " ").trim();
    els.suggestions.appendChild(li);
    els.results?.removeAttribute("hidden");
  }

  // ------------- Boot -------------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      // Ensure Firebase exists (index.html boot loader sets OH_FIREBASE)
      if (!window.firebase && !(window.OH_FIREBASE && window.OH_FIREBASE.db)) {
        throw new Error("Firebase SDK not loaded.");
      }
      setStatus("Loading rules…", "status");
      const data = await loadRulesFromFirestore();
      console.log("[OH] Modalities summary:", data.modalities);
      RULES = data;
      buildUI(RULES);
      wireEvents();
      setStatus("Rules loaded.", "status success");
      if (els.dbg) els.dbg.textContent = `[OH] Ready (${new Date().toLocaleString()})`;
    } catch (e) {
      console.error(e);
      setStatus("Init failed: " + e.message, "status error");
      RULES = FALLBACK_RULES;
      buildUI(RULES);
    }
  });
})();

