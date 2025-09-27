(() => {
  const qs = (s) => document.querySelector(s);
  const setStatus = (msg, cls = "status success") => {
    const s = qs("#status");
    if (s) { s.textContent = msg; s.className = cls; }
  };

  // Catch sync + async errors (surface to the UI)
  window.addEventListener("error", (e) =>
    setStatus("JavaScript error: " + (e.message || "Unknown"), "status error")
  );
  window.addEventListener("unhandledrejection", (e) =>
    setStatus("App error: " + (e.reason?.message || e.reason || "Unknown"), "status error")
  );

  /**
   * OraDigit Order Helper — app.js (rev5 Firestore-dynamic, indication & suggestions)
   *
   * Requires Firebase compat SDKs already loaded on the page:
   *   <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js"></script>
   *   <script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js"></script>
   *   (Auth optional)
   */

  // --- Elements ---
  const els = {
    status: document.getElementById("status"),
    form: document.getElementById("orderForm"),
    modality: document.getElementById("modality"),
    region: document.getElementById("region"),
    context: document.getElementById("context"),           // hidden <select multiple>
    contextChips: document.getElementById("contextChips"), // clickable chips
    condition: document.getElementById("condition"),
    conditionList: document.getElementById("conditionList"),
    indication: document.getElementById("indication"),
    contrastGroup: document.getElementById("contrastGroup"),
    oral: document.getElementById("oralContrast"),

    // Results section (optional ids on page)
    outHeader: document.getElementById("outHeader"),
    outReason: document.getElementById("outReason"),
    outPrep: document.getElementById("outPrep"),
    outDocs: document.getElementById("outDocs"),
    outFlags: document.getElementById("outFlags"),
    results: document.getElementById("results"),
    suggestions: document.getElementById("suggestions"),

    // Actions
    copyReasonBtn: document.getElementById("copyReasonBtn"),
    copyAllBtn: document.getElementById("copyAllBtn"),
    printBtn: document.getElementById("printBtn"),
    dbg: document.getElementById("dbg"),
  };

  // --- In-memory model (same shape whether from Firestore or fallback) ---
  // RULES = { modalities: { "CT": {regions, contexts, conditions, indication_templates?, contrast_rules?}, ... }, records: [ ... ] }
  let RULES = null;

  // Minimal fallback to keep UI usable offline
  const FALLBACK_RULES = {
    modalities: {
      "PET/CT": { regions: ["Skull base to mid-thigh"], contexts: ["Staging"], conditions: ["NSCLC"] },
      "CT":     { regions: ["Head/Brain", "Chest", "Abdomen/Pelvis"], contexts: ["Acute", "Follow-up"], conditions: ["PE", "Renal colic", "Appendicitis"] },
      "MRI":    { regions: ["Brain", "Cervical spine", "Lumbar spine"], contexts: ["Problem solving", "Follow-up"], conditions: ["MS", "Radiculopathy"] }
    },
    records: []
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    try {
      RULES = await loadRulesFromFirestore();
      populateModalitySelect(RULES);
      renderForMod(els.modality?.value || Object.keys(RULES.modalities)[0] || "PET/CT");
      wireEvents();
      setStatus("Rules loaded.");
      els.dbg && (els.dbg.textContent = `[OH] Ready (${new Date().toLocaleString()})`);
    } catch (e) {
      console.error("[OH] Firestore load failed:", e);
      setStatus("Using built-in defaults (Firestore unavailable).", "status warn");
      RULES = FALLBACK_RULES;
      populateModalitySelect(RULES);
      renderForMod(els.modality?.value || "PET/CT");
      wireEvents();
    }
  }

  // ---------- Firestore loader (dynamic) ----------
  async function loadRulesFromFirestore() {
    if (!window.firebase?.firestore) throw new Error("Firebase Firestore not available on page");
    const db = firebase.firestore();

    const out = { modalities: {}, records: [] };

    // Top-level: /published_rules (each doc is a modality container)
    const topSnap = await db.collection("published_rules").get();
    if (topSnap.empty) throw new Error("No /published_rules docs found");

    for (const doc of topSnap.docs) {
      const modalityId = doc.id;                 // e.g. "ct", "petct", "x_ray" etc.
      const m = doc.data() || {};                // may contain: name, regions, contexts, conditions, indication_templates, contrast_rules
      const displayName = m.name || prettifyId(modalityId);

      // Fetch records subcollection
      const recSnap = await db.collection("published_rules").doc(modalityId).collection("records").get();
      const records = recSnap.docs.map(d => ({ id: d.id, modality: displayName, ...d.data() }));

      out.records.push(...records);

      // Prefer modality-level lists if given; else derive from records
      const regions    = (Array.isArray(m.regions)    && m.regions.length)    ? m.regions    : uniq(records.flatMap(r => r.regions || []));
      const contexts   = (Array.isArray(m.contexts)   && m.contexts.length)   ? m.contexts   : uniq(records.flatMap(r => r.contexts || []));
      const conditions = (Array.isArray(m.conditions) && m.conditions.length) ? m.conditions : uniq(records.flatMap(r => r.conditions || []));

      out.modalities[displayName] = {
        regions,
        contexts,
        conditions,
        indication_templates: Array.isArray(m.indication_templates) ? m.indication_templates.slice() : undefined,
        contrast_rules: Array.isArray(m.contrast_rules) ? m.contrast_rules.slice() : undefined
      };

      console.log(`Loaded ${displayName}: ${records.length} records`);
    }

    return out;
  }

  // ---------- UI builders ----------
  function populateModalitySelect(cat) {
    if (!els.modality) return;
    const names = Object.keys(cat.modalities);
    els.modality.innerHTML = "";
    names.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      if (i === 0) opt.selected = true;
      els.modality.appendChild(opt);
    });
  }

  function renderForMod(modality) {
    const spec = RULES.modalities[modality] || { regions: [], contexts: [], conditions: [] };
    fillSelect(els.region, spec.regions, "Select region…");
    renderContextChips(spec.contexts);
    fillDatalist(els.conditionList, spec.conditions);

    // CT contrast UI only
    showContrast(modality === "CT");

    // Clear text inputs for new modality
    if (els.condition) els.condition.value = "";
    if (els.indication) els.indication.value = "";

    syncPreview();
  }

  function fillSelect(selectEl, values, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = ""; ph.textContent = placeholder || "Select…";
    selectEl.appendChild(ph);
    (values || []).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      selectEl.appendChild(opt);
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
      btn.setAttribute("aria-label", `Toggle context ${label}`);
      btn.addEventListener("click", () => {
        const on = btn.getAttribute("aria-pressed") === "true";
        btn.setAttribute("aria-pressed", on ? "false" : "true");
        mirrorChipsToHiddenSelect();
        buildIndication();
        syncPreview();
      });
      els.contextChips.appendChild(btn);
    });
    mirrorChipsToHiddenSelect(); // reset hidden select
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

  // ---------- Contrast helpers (CT only) ----------
  function showContrast(show) {
    if (!els.contrastGroup) return;
    els.contrastGroup.classList.toggle("hidden", !show);
    if (!show) {
      // clear radios if hiding
      els.contrastGroup.querySelectorAll("input[type=radio]").forEach(r => r.checked = false);
      if (els.oral) els.oral.checked = false;
    }
  }

  function contrastTextFromForm() {
    if (!els.contrastGroup || els.contrastGroup.classList.contains("hidden")) return "";
    const radio = els.contrastGroup.querySelector('input[type=radio]:checked');
    const oral = els.oral?.checked ? " + oral contrast" : "";
    if (!radio) return oral ? "(" + oral.trim() + ")" : "";
    if (radio.value === "with_iv") return "(with IV contrast" + oral + ")";
    if (radio.value === "without_iv") return "(without IV contrast" + oral + ")";
    return oral ? "(" + oral.trim() + ")" : "";
  }

  // Simple CT auto-suggest based on common keywords
  function suggestContrastIfCT() {
    if ((els.modality?.value || "") !== "CT") return;
    const text = `${els.condition?.value || ""} ${els.region?.value || ""}`.toLowerCase();
    const withIV = els.contrastGroup?.querySelector('input[type=radio][value="with_iv"]');
    const withoutIV = els.contrastGroup?.querySelector('input[type=radio][value="without_iv"]');

    const rules = [
      { match: ["kidney stone", "renal colic", "hematuria"], pick: "without_iv" },
      { match: ["appendicitis", "rlq"], pick: "with_iv" },
      { match: ["pe", "pulmonary embol"], pick: "with_iv" },
      { match: ["aortic", "dissection", "aneurysm"], pick: "with_iv" },
      { match: ["liver lesion", "pancreatitis"], pick: "with_iv" },
      { match: ["bowel obstruction"], pick: "without_iv" },
      { match: ["trauma"], pick: "with_iv" },
      { match: ["low-dose lung", "screening"], pick: "without_iv" }
    ];
    for (const r of rules) {
      if (r.match.every(tok => text.includes(tok))) {
        if (r.pick === "with_iv" && withIV) withIV.checked = true;
        if (r.pick === "without_iv" && withoutIV) withoutIV.checked = true;
        break;
      }
    }
    // Any CTA mention → with IV
    if ((els.region?.value || "").toLowerCase().includes("cta")) {
      withIV && (withIV.checked = true);
    }
  }

  // ---------- Indication builder ----------
  function getSelectedContexts() {
    if (!els.context) return [];
    return [...els.context.selectedOptions].map(o => (o.value || "").trim()).filter(Boolean);
  }

  function buildIndication() {
    if (!els.indication) return;
    const modality = els.modality?.value || "";
    const spec = RULES.modalities[modality] || {};
    const region = els.region?.value || "";
    const contexts = getSelectedContexts().join(", ");
    const condition = els.condition?.value || "";
    const contrast_text = contrastTextFromForm();

    const defaultTemplates = modality === "CT"
      ? ["CT {region}{contrast_text} — {context} for {condition}"]
      : modality === "PET/CT"
      ? ["FDG PET/CT {region} — {context} for {condition}"]
      : [`${modality} {region} — {context} for {condition}`];

    const templates = spec.indication_templates && spec.indication_templates.length
      ? spec.indication_templates
      : defaultTemplates;

    // Prefer a template that includes {contrast_text} if we have contrast
    const t = (contrast_text && templates.find(x => x.includes("{contrast_text}"))) || templates[0];

    const out = t
      .replace("{region}", region)
      .replace("{context}", contexts)
      .replace("{condition}", condition)
      .replace("{contrast_text}", contrast_text ? ` ${contrast_text}` : "");

    els.indication.value = out.trim();
  }

  // ---------- Suggestions from records ----------
  function scoreRecord(rec, modality, region, contexts, condition) {
    if ((rec.modality || "").toLowerCase() !== (modality || "").toLowerCase()) return -1;
    let s = 0;
    if (rec.header_coverage && region && rec.header_coverage.toLowerCase().includes(region.toLowerCase())) s += 3;
    (rec.contexts || []).forEach((c) => {
      if (contexts.some(ctx => ctx.toLowerCase() === (c || "").toLowerCase())) s += 2;
    });
    (rec.keywords || []).forEach((k) => {
      if (condition && condition.toLowerCase().includes((k || "").toLowerCase())) s += 2;
    });
    if ((rec.tags || []).includes("oncology") && /tumou?r|cancer|metast/i.test(condition || "")) s += 1;
    return s;
  }

  function fillResults(topRec, contextStr, conditionStr) {
    if (!els.results || !topRec) return;

    if (els.outHeader) {
      const hdr = topRec.study_name || topRec.header || topRec.header_coverage || "Suggested Study";
      els.outHeader.textContent = hdr;
    }

    // Reason (prefer record reason template if available)
    if (els.outReason) {
      const tmpl = (topRec.reasons || [])[0] || "{context} for {condition}";
      els.outReason.value = tmpl.replace("{context}", contextStr || "").replace("{condition}", conditionStr || "");
    }

    const fillUL = (ul, arr) => {
      if (!ul) return;
      ul.innerHTML = "";
      (arr || []).forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      });
    };
    fillUL(els.outPrep,  topRec.prep_notes || topRec.prep || []);
    fillUL(els.outDocs,  topRec.supporting_docs || []);
    fillUL(els.outFlags, topRec.flags || []);

    els.results.removeAttribute("hidden");
  }

  function suggestStudies() {
    if (!els.suggestions) return;
    const modality  = els.modality?.value || "";
    const region    = els.region?.value || "";
    const contexts  = getSelectedContexts();
    const condition = els.condition?.value || "";

    const scored = (RULES.records || [])
      .map(r => ({ r, s: scoreRecord(r, modality, region, contexts, condition) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);

    els.suggestions.innerHTML = "";
    if (!scored.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No specific suggestions — adjust region/context/condition.";
      els.suggestions.appendChild(li);
    } else {
      scored.forEach(({ r }) => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${r.study_name || r.header || r.header_coverage || "Suggested study"}</strong>`;
        li.title = (r.reasons || [])[0] || "";
        els.suggestions.appendChild(li);
      });
      fillResults(scored[0].r, contexts.join(", "), condition);
    }

    // Also (re)build indication into the textarea
    buildIndication();
  }

  // ---------- Chips <-> hidden select sync ----------
  function mirrorChipsToHiddenSelect() {
    if (!els.context) return;
    const active = [...(els.contextChips?.querySelectorAll('.oh-chip[aria-pressed="true"]') || [])]
      .map(el => (el.textContent || "").trim())
      .filter(Boolean);
    els.context.innerHTML = "";
    active.forEach(label => {
      const opt = document.createElement("option");
      opt.value = label; opt.textContent = label; opt.selected = true;
      els.context.appendChild(opt);
    });
  }

  // ---------- Preview ----------
  function syncPreview() {
    const ctx = getSelectedContexts();
    const pv = (id, val) => { const el = qs(id); if (el) el.textContent = val; };
    pv("#pv-modality",  els.modality?.value || "—");
    pv("#pv-region",    els.region?.value || "—");
    pv("#pv-context",   ctx.length ? ctx.join(", ") : "—");
    pv("#pv-condition", els.condition?.value || "—");

    // Contrast preview (CT only)
    const pvCon = qs("#pv-contrast");
    if (pvCon) {
      if (els.contrastGroup && !els.contrastGroup.classList.contains("hidden")) {
        const r = els.contrastGroup.querySelector('input[type=radio]:checked');
        const oral = els.oral?.checked;
        let txt = r ? (r.value === "with_iv" ? "With IV contrast" : "Without IV contrast") : "—";
        if (oral) txt += " + oral";
        pvCon.textContent = txt;
      } else {
        pvCon.textContent = "—";
      }
    }

    pv("#pv-indication", els.indication?.value?.trim() || "—");
  }

  // ---------- Events ----------
  function wireEvents() {
    // Modality change → rebuild UI
    els.modality?.addEventListener("change", () => {
      renderForMod(els.modality.value);
      buildIndication();
    });

    // Region / Condition changes
    ["change", "input"].forEach(evt => {
      els.region?.addEventListener(evt, () => {
        suggestContrastIfCT();
        buildIndication();
        syncPreview();
      });
      els.condition?.addEventListener(evt, () => {
        suggestContrastIfCT();
        buildIndication();
        syncPreview();
      });
    });

    // Contrast radios
    els.contrastGroup?.addEventListener("change", () => {
      buildIndication();
      syncPreview();
    });
    els.oral?.addEventListener("change", () => {
      buildIndication();
      syncPreview();
    });

    // Click-to-toggle chips (delegated)
    document.addEventListener("click", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      const cur = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", cur ? "false" : "true");
      mirrorChipsToHiddenSelect();
      buildIndication();
      syncPreview();
    });
    // Keyboard toggle (space/enter)
    document.addEventListener("keydown", (e) => {
      const chip = e.target.closest("#contextChips .oh-chip");
      if (!chip) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); chip.click(); }
    });

    // Form submit → compute suggestions + fill results
    els.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      suggestStudies();
      setStatus("Order suggestion updated.", "status success");
    });

    // Copy buttons
    qs("#copyIndication")?.addEventListener("click", async () => {
      const txt = els.indication?.value?.trim();
      if (!txt) return;
      try { await navigator.clipboard.writeText(txt); setStatus("Clinical indication copied.", "status success"); }
      catch { setStatus("Unable to copy. Please copy manually.", "status warn"); }
    });

    els.copyReasonBtn?.addEventListener("click", async () => {
      const v = els.outReason?.value?.trim();
      if (!v) return;
      try { await navigator.clipboard.writeText(v); setStatus("Reason copied.", "status success"); }
      catch { setStatus("Unable to copy reason. Select and copy manually.", "status warn"); }
    });

    els.copyAllBtn?.addEventListener("click", async () => {
      const parts = [];
      if (els.outHeader) parts.push(els.outHeader.textContent);
      if (els.outReason?.value) parts.push("Reason: " + els.outReason.value);
      if (els.outPrep?.children?.length)  parts.push("Prep: "  + [...els.outPrep.children].map(li => li.textContent).join("; "));
      if (els.outDocs?.children?.length)  parts.push("Docs: "  + [...els.outDocs.children].map(li => li.textContent).join("; "));
      if (els.outFlags?.children?.length) parts.push("Flags: " + [...els.outFlags.children].map(li => li.textContent).join("; "));
      const text = parts.join("\n");
      if (!text.trim()) return;
      try { await navigator.clipboard.writeText(text); setStatus("All details copied.", "status success"); }
      catch { setStatus("Unable to copy. Select and copy manually.", "status warn"); }
    });

    // Print
    els.printBtn?.addEventListener("click", () => window.print());
  }

  // ---------- Utils ----------
  const uniq = (arr) => Array.from(new Set(arr || [])).filter(Boolean);
  const prettifyId = (id) =>
    (id || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b(ct|mri|pet|x|us|ir|nm)\b/gi, (m) => m.toUpperCase())
      .replace(/\bpet ct\b/i, "PET/CT")
      .replace(/\bcta\b/i, "CTA")
      .replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));

})();

