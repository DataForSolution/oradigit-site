(() => {
  const qs = (s) => document.querySelector(s);
  const setStatus = (msg, cls = "status success") => {
    const s = qs("#status");
    if (s) {
      s.textContent = msg;
      s.className = cls;
    }
  };

  // Catch sync + async errors
  window.addEventListener("error", (e) =>
    setStatus("JavaScript error: " + (e.message || "Unknown"), "status error")
  );
  window.addEventListener("unhandledrejection", (e) =>
    setStatus(
      "App error: " + (e.reason?.message || e.reason || "Unknown"),
      "status error"
    )
  );

  /**
   * OraDigit Order Helper – app.js (rev2 clean)
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

  const RULES_URL =
    document.querySelector('meta[name="oh-rules-path"]')?.content ||
    "./data/rules.json";

  let RULES = null;

  // ----------- Fallback rules (trimmed for brevity) -----------
  const FALLBACK_RULES = {
    modalities: {
      "PET/CT": { regions: ["Skull base to mid-thigh"], contexts: ["Staging"], conditions: ["NSCLC"] },
      CT: { regions: ["Head/Brain", "Chest"], contexts: ["Acute"], conditions: ["PE", "Renal colic"] },
      MRI: { regions: ["Brain", "Spine"], contexts: ["Follow-up"], conditions: ["MS"] }
    },
    records: []
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    try {
      RULES = await loadRules();
      buildUI(RULES);
      wireEvents();
      setStatus("Rules loaded.");
      if (els.dbg)
        els.dbg.textContent = `[OH] Ready (${new Date().toLocaleString()})`;
    } catch (e) {
      setStatus("Init failed: " + e.message, "status error");
    }
  }

  async function loadRules() {
    try {
      const r = await fetch(RULES_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const json = await r.json();
      return json?.modalities ? json : FALLBACK_RULES;
    } catch (e) {
      console.warn("Failed to load rules.json, using fallback", e);
      setStatus("Using built-in fallback rules", "warn");
      return FALLBACK_RULES;
    }
  }

  function buildUI(cat) {
    // populate initial UI for default modality
    renderForMod(cat, els.modality?.value || "PET/CT");
  }

  function renderForMod(cat, modality) {
    const spec = cat.modalities[modality] || { regions: [], contexts: [], conditions: [] };
    fillSelect(els.region, spec.regions, "Select region…");
    renderContextChips(spec.contexts);
    fillDatalist(els.conditionList, spec.conditions);
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

  // ----------- Event wiring -----------
  function wireEvents() {
    els.modality?.addEventListener("change", () =>
      renderForMod(RULES, els.modality.value)
    );

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
        setStatus("Clinical indication copied.", "success");
      } catch {
        setStatus("Unable to copy. Please copy manually.", "warn");
      }
    });

    // Copy Reason
    els.copyReasonBtn?.addEventListener("click", async () => {
      const v = els.outReason?.value?.trim();
      if (!v) return;
      try {
        await navigator.clipboard.writeText(v);
        setStatus("Reason copied.", "success");
      } catch {
        setStatus("Unable to copy reason.", "warn");
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
        setStatus("All details copied.", "success");
      } catch {
        setStatus("Unable to copy all.", "warn");
      }
    });

    // Print
    els.printBtn?.addEventListener("click", () => window.print());
  }

  function suggestStudies() {
    const modality = els.modality?.value || "";
    const region = els.region?.value || "";
    const ctx = [...els.context.selectedOptions].map((o) => o.value);
    const condition = els.condition?.value || "";
    els.suggestions.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = `${modality} ${region} ${ctx.join(", ")} ${condition}`;
    els.suggestions.appendChild(li);
    els.results?.removeAttribute("hidden");
  }
})();
