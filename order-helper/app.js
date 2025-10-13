// order-helper/app.js  (Firestore-only, robust normalize, rev7)
(() => {
  const qs = (s) => document.querySelector(s);
  const setStatus = (msg, cls = "status success") => {
    const s = qs("#status");
    if (s) { s.textContent = msg; s.className = cls; }
  };
  // put this near the top of the file or above the event listener:


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
   header: document.getElementById("header"),
  reasonTemplate: document.getElementById("reasonTemplate"),
  keywords: document.getElementById("keywords"),
  prep: document.getElementById("prep"),
  docs: document.getElementById("docs"),
  flags: document.getElementById("flags"),
  tags: document.getElementById("tags"),

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
   // Try to load the structured spec document (preferred)
const loadSpecDoc = async (db, path, label) => {
  // Admin.js writes to: /published_rules/{MOD}/spec/spec
  const specRef = db.collection("published_rules").doc(path).collection("spec").doc("spec");
  const snap = await specRef.get();
  if (snap.exists) {
    const spec = snap.data();
    console.log(`[OH] Loaded spec for ${label}`, spec);
    return {
      regions: spec.regions || [],
      contexts: spec.contexts || (DEFAULT_CONTEXTS[label] || []),
      conditions: spec.conditions || [],
      indication_templates: spec.indication_templates || []
    };
  }
  return null;
};

// ------------- Firestore load -------------
   // ------------- Firestore load -------------
async function loadRulesFromFirestore() {
  const db =
    (window.OH_FIREBASE && window.OH_FIREBASE.db) ||
    (window.firebase && window.firebase.firestore && window.firebase.firestore());
  if (!db) throw new Error("Firebase Firestore not initialized. Check index loader.");

  const out = { modalities: {}, records: [] };

  // We always store under the *label* key, e.g., "CT", "MRI", "PET/CT"
  for (const [label, path] of Object.entries(MODALITY_MAP)) {
    try {
      // 1️⃣ Preferred structure: /published_rules/{path} (root fields)
      const topSnap = await db.collection("published_rules").doc(path).get();
      if (topSnap.exists) {
        const doc = topSnap.data() || {};

        // 🔹 NEW: Flatten Firestore-style "records" array into summary lists
        if (Array.isArray(doc.records)) {
          const grouped = {
            regions: [], contexts: [], conditions: [], indication_templates: [],
            reason_templates: [], headers: [], keywords: [],
            prep: [], docs: [], flags: [], tags: []
          };

          for (const r of doc.records) {
            if (r.region) grouped.regions.push(r.region);
            if (Array.isArray(r.contexts)) grouped.contexts.push(...r.contexts);
            if (Array.isArray(r.conditions)) grouped.conditions.push(...r.conditions);
            if (Array.isArray(r.reasons)) grouped.reason_templates.push(...r.reasons);
            if (Array.isArray(r.keywords)) grouped.keywords.push(...r.keywords);
            if (Array.isArray(r.prep_notes)) grouped.prep.push(...r.prep_notes);
            if (Array.isArray(r.supporting_docs)) grouped.docs.push(...r.supporting_docs);
            if (Array.isArray(r.flags)) grouped.flags.push(...r.flags);
            if (Array.isArray(r.tags)) grouped.tags.push(...r.tags);
            if (r.header_coverage) grouped.headers.push(r.header_coverage);
          }
          // De-duplicate
          for (const k in grouped) grouped[k] = [...new Set(grouped[k].filter(Boolean))];
          Object.assign(doc, grouped);
        }

        out.modalities[label] = {
          regions: doc.regions || [],
          contexts: doc.contexts || (DEFAULT_CONTEXTS[label] || []),
          conditions: doc.conditions || [],
          indication_templates: doc.indication_templates || [],
          reason_templates: doc.reason_templates || [],
          headers: doc.headers || [],
          keywords: doc.keywords || [],
          prep: doc.prep || [],
          docs: doc.docs || [],
          flags: doc.flags || [],
          tags: doc.tags || [],
        };
        console.log(`[OH] Loaded root rules for ${label}`);
        continue;
      }

      // 2️⃣ Legacy fallback: /published_rules/{path}/spec/spec
      const specSnap = await db.doc(`published_rules/${path}/spec/spec`).get();
      if (specSnap.exists) {
        const spec = specSnap.data() || {};
        console.log(`[OH] Loaded spec for ${label}:`, Object.keys(spec));

        out.modalities[label] = {
          regions: spec.regions || [],
          contexts: spec.contexts || (DEFAULT_CONTEXTS[label] || []),
          conditions: spec.conditions || [],
          indication_templates: spec.indication_templates || [],
          reason_templates: spec.reason_templates || [],
          headers: spec.headers || [],
          keywords: spec.keywords || [],
          prep: spec.prep || [],
          docs: spec.docs || [],
          flags: spec.flags || [],
          tags: spec.tags || [],
        };
        continue;
      }

      console.warn(`[OH] No rules for ${label} (path ${path})`);
    } catch (err) {
      console.warn(`[OH] Failed to load ${label} rules`, err);
    }
  }

  if (!Object.keys(out.modalities).length) {
    setStatus("No Firestore rules found, using fallback", "status warn");
    return FALLBACK_RULES;
  }

  console.log("[OH] Loaded modalities:", Object.keys(out.modalities));
  return out;
}

  
   // ------------- UI build -------------
   // ------------- UI build -------------
function buildUI(cat) {
  renderForMod(cat, els.modality?.value || "PET/CT");
}

function renderForMod(cat, modality) {
  // Read back by *label* (matches how we stored it above)
  const modData = cat.modalities[modality] || {};

  // Merge with defaults to avoid undefineds
  const spec = {
    regions: modData.regions || [],
    contexts: modData.contexts || (DEFAULT_CONTEXTS[modality] || []),
    conditions: modData.conditions || [],
    indication_templates: modData.indication_templates || [],
    reason_templates: modData.reason_templates || [],
    headers: modData.headers || [],
    keywords: modData.keywords || [],
    prep: modData.prep || [],
    docs: modData.docs || [],
    flags: modData.flags || [],
    tags: modData.tags || [],
  };

  console.log(`[OH] Rendering for ${modality}:`, spec);

  // --- Fill UI elements ---
  fillSelect(els.region, spec.regions, "Select region…");
  renderContextChips(spec.contexts);
  fillDatalist(els.conditionList, spec.conditions);

  // Clinical Indications
  if (els.indication && els.indication.tagName === "SELECT") {
    fillSelect(els.indication, spec.indication_templates, "Select clinical indication…");
  } else if (els.indication) {
    els.indication.placeholder = "Enter clinical indication (or auto-generate)";
  }

  // Extended dropdowns
  if (els.reasonTemplate) fillSelect(els.reasonTemplate, spec.reason_templates, "Select reason template…");
  if (els.header)         fillSelect(els.header,         spec.headers,          "Select header…");
  if (els.keywords)       fillSelect(els.keywords,       spec.keywords,         "Select keyword…");
  if (els.prep)           fillSelect(els.prep,           spec.prep,             "Select prep…");
  if (els.docs)           fillSelect(els.docs,           spec.docs,             "Select document…");
  if (els.flags)          fillSelect(els.flags,          spec.flags,            "Select flag…");
  if (els.tags)           fillSelect(els.tags,           spec.tags,             "Select tag…");

  // CT-specific contrast section
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

  // Selected contexts
  const ctx = [...els.context.selectedOptions].map(o => o.value).filter(Boolean);
  qs("#pv-context").textContent = ctx.length ? ctx.join(", ") : "—";

  // Condition
  qs("#pv-condition").textContent = els.condition?.value || "—";

  // Clinical Indication (supports <select>, <input>, or <textarea>)
  if (els.indication) {
    let val = "";
    if (els.indication.tagName === "SELECT") {
      val = els.indication.value;
    } else {
      val = els.indication.value || els.indication.placeholder || "";
    }
    qs("#pv-indication").textContent = val || "—";
   // Inside syncPreview()
if (els.indication) {
  let val = "";
  if (els.indication.tagName === "SELECT") {
    if (els.indication.value === "__other__") {
      const other = document.getElementById("indicationOther");
      val = (other?.value || "").trim();
    } else {
      val = els.indication.value;
    }
  } else {
    val = els.indication.value || els.indication.placeholder || "";
  }
  qs("#pv-indication").textContent = val || "—";
}
  // Reason Template
  qs("#pv-reasonTemplate") && (qs("#pv-reasonTemplate").textContent = els.reasonTemplate?.value || "—");

  // Header
  qs("#pv-header") && (qs("#pv-header").textContent = els.header?.value || "—");

  // Keywords
  if (qs("#pv-keywords")) {
    const kw = els.keywords?.value || "";
    qs("#pv-keywords").textContent = kw ? kw.split(",").map(k => k.trim()).filter(Boolean).join(", ") : "—";
  }

  // Prep
  if (qs("#pv-prep")) {
    const p = els.prep?.value || "";
    qs("#pv-prep").textContent = p ? p.split(",").map(x => x.trim()).filter(Boolean).join(", ") : "—";
  }

  // Docs
  if (qs("#pv-docs")) {
    const d = els.docs?.value || "";
    qs("#pv-docs").textContent = d ? d.split(",").map(x => x.trim()).filter(Boolean).join(", ") : "—";
  }

  // Flags
  if (qs("#pv-flags")) {
    const f = els.flags?.value || "";
    qs("#pv-flags").textContent = f ? f.split(",").map(x => x.trim()).filter(Boolean).join(", ") : "—";
  }

  // Tags
  if (qs("#pv-tags")) {
    const t = els.tags?.value || "";
    qs("#pv-tags").textContent = t ? t.split(",").map(x => x.trim()).filter(Boolean).join(", ") : "—";
  }

  }
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
    document.getElementById("indicationOther")
    ?.addEventListener("input", syncPreview);
  document.getElementById("indication")
    ?.addEventListener("change", syncPreview);
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
// --- Ask AI button wiring ---
const AI_HELPER_URL = "https://us-central1-oradigit-ce343.cloudfunctions.net/aiHelper";

const aiBtn = document.getElementById("btnAI");
if (aiBtn) {
  aiBtn.addEventListener("click", async () => {
    const aiBox = document.getElementById("aiResponse");
    const aiText = document.getElementById("aiText");

    aiBox.style.display = "block";
    aiText.textContent = "Thinking…";

    try {
      // Gather the current order details as structured JSON
      const review = {
  modality: els.modality?.value || "",
  region: els.region?.value || "",
  context: [...els.context.selectedOptions].map(o => o.value),
  condition: els.condition?.value || "",
  indication: els.indication?.value || "",
  reason: els.outReason?.value || "",
  reasonTemplate: els.reasonTemplate?.value || "",
  header: els.header?.value || "",
  keywords: els.keywords?.value || "",
  prep: els.prep?.value || "",
  docs: els.docs?.value || "",
  flags: els.flags?.value || "",
  tags: els.tags?.value || ""
};
  console.log("[OH] Sending review:", review);
window.lastReview = review;


      // Call Firebase Cloud Function with structured JSON
      const res = await fetch(AI_HELPER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review })
      });

      const data = await res.json();
      aiText.textContent = data.answer || "No response from AI.";
    } catch (err) {
      console.error("Ask AI failed:", err);
      aiText.textContent = "Error: Could not reach AI service.";
    }
  });
}

})();  // <-- this MUST be at the very end of the file
