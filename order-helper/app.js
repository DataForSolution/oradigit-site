/* OraDigit Order Helper – robust init + live preview
   - Reads rules URL from <meta name="oh-rules-path">
   - Works if rules.json is missing or has a different shape
   - Populates Region, Context chips, Condition suggestions
   - Keeps the right-side Order Preview live
*/

(() => {
  const $ = (s) => document.querySelector(s);

  const FALLBACK = {
    CONTEXTS: [
      "Staging",
      "Restaging",
      "Treatment response",
      "Surveillance",
      "Suspected recurrence",
      "Infection / inflammation",
      "Viability",
    ],
    REGIONS: {
      "PET/CT": ["Whole body", "Head & neck", "Thorax/Chest", "Abdomen/Pelvis", "Brain"],
      CT: ["Head", "Neck", "Chest", "Abdomen", "Pelvis", "Abdomen/Pelvis", "Angio/PE", "Sinus", "Spine", "Extremity"],
      MRI: ["Brain", "C-spine", "T-spine", "L-spine", "Shoulder", "Knee", "Hip", "Abdomen", "Pelvis", "Prostate", "Cardiac"],
    },
    CONDITIONS: {
      CT: ["Renal colic", "Pulmonary embolism", "Appendicitis", "Diverticulitis", "Kidney stone"],
      MRI: ["Multiple sclerosis", "Lumbar radiculopathy", "Rotator cuff tear", "Meniscal tear", "Hip labral tear"],
      "PET/CT": ["NSCLC", "Lymphoma", "Breast cancer", "Colorectal cancer", "Melanoma"],
    },
  };

  function setStatus(msg, kind = "success") {
    const s = $("#status");
    if (!s) return;
    s.textContent = msg;
    s.className = `status ${kind}`;
  }

  function rulesURL() {
    const meta = document.querySelector('meta[name="oh-rules-path"]');
    const url = meta?.content?.trim();
    return url || "/order-helper/data/rules.json";
  }

  async function loadRules() {
    try {
      const r = await fetch(rulesURL(), { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setStatus("Rules loaded.", "success");
      return json;
    } catch (e) {
      setStatus("Using built-in defaults (rules not available).", "warn");
      return null;
    }
  }

  // Try multiple likely shapes, return array or null
  function listFromRules(rules, modality, key) {
    if (!rules) return null;

    // Common shapes we support:
    // 1) { modalities: { "CT": { regions:[...], contexts:[...], conditions:[...] } } }
    if (rules.modalities?.[modality]?.[key]) return rules.modalities[modality][key];

    // 2) { "CT": { regions:[...], contexts:[...], conditions:[...] } }
    if (rules[modality]?.[key]) return rules[modality][key];

    // 3) { regions: { "CT":[...] }, contexts: { "CT":[...] }, conditions: { "CT":[...] } }
    if (rules[key]?.[modality]) return rules[key][modality];

    // 4) Global arrays: { regions:[...]} (rare)
    if (Array.isArray(rules[key])) return rules[key];

    // Handle singular miskeys
    if (key === "contexts") {
      if (rules.modalities?.[modality]?.context) return rules.modalities[modality].context;
      if (rules[modality]?.context) return rules[modality].context;
    }
    return null;
  }

  function buildRegionOptions(rules, modality) {
    const sel = $("#region");
    if (!sel) return;
    sel.innerHTML = "";

    const regions = listFromRules(rules, modality, "regions") || FALLBACK.REGIONS[modality] || [];
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Select region…";
    sel.appendChild(opt0);

    regions.forEach((r) => {
      const o = document.createElement("option");
      o.value = r;
      o.textContent = r;
      sel.appendChild(o);
    });
  }

  function buildContextChips(rules, modality) {
    const wrap = $("#contextChips");
    const hidden = $("#context");
    if (!wrap || !hidden) return;

    wrap.innerHTML = "";
    hidden.innerHTML = "";

    const contexts = listFromRules(rules, modality, "contexts") || FALLBACK.CONTEXTS;
    contexts.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = c;
      btn.dataset.value = c;
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        syncContextHidden();
        syncPreview();
      });
      wrap.appendChild(btn);

      const opt = document.createElement("option");
      opt.value = c;
      hidden.appendChild(opt);
    });
  }

  function syncContextHidden() {
    const hidden = $("#context");
    if (!hidden) return;
    const active = Array.from(document.querySelectorAll("#contextChips .chip.active")).map((b) => b.dataset.value);
    Array.from(hidden.options).forEach((o) => (o.selected = active.includes(o.value)));
  }

  function buildConditionList(rules, modality) {
    const dl = $("#conditionList");
    if (!dl) return;
    dl.innerHTML = "";
    const list = listFromRules(rules, modality, "conditions") || FALLBACK.CONDITIONS[modality] || [];
    list.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      dl.appendChild(o);
    });
  }

  function toggleContrast(show) {
    const g = $("#contrastGroup");
    if (!g) return;
    g.classList.toggle("hidden", !show);
  }

  function syncPreview() {
    const mod = $("#modality")?.value || "—";
    $("#pv-modality").textContent = mod;
    $("#pv-region").textContent = $("#region")?.value || "—";

    const ctx = Array.from(document.querySelectorAll("#context option:checked")).map((o) => o.value);
    $("#pv-context").textContent = ctx.length ? ctx.join(", ") : "—";

    $("#pv-condition").textContent = $("#condition")?.value || "—";

    const cg = $("#contrastGroup");
    if (cg && !cg.classList.contains("hidden")) {
      const r = cg.querySelector("input[type=radio]:checked");
      const oral = $("#oralContrast")?.checked;
      let txt = r ? (r.value === "with_iv" ? "With IV contrast" : "Without IV contrast") : "—";
      if (oral) txt += " + oral";
      $("#pv-contrast").textContent = txt;
    } else {
      $("#pv-contrast").textContent = "—";
    }

    $("#pv-indication").textContent = ($("#indication")?.value || "—").trim();
  }

  function buildIndication() {
    const mod = $("#modality").value;
    const reg = $("#region").value;
    const ctx = Array.from(document.querySelectorAll("#context option:checked")).map((o) => o.value);
    const cond = $("#condition").value;

    let s = "";
    if (mod && reg) s += `${mod} ${reg}`;
    else if (mod) s += mod;
    if (cond) s += ` for ${cond}`;
    if (ctx.length) s += ` (${ctx.join(", ")})`;
    return s;
  }

  function onFormChange() {
    const txt = buildIndication();
    if (txt) $("#indication").value = txt;
    syncPreview();
  }

  function wireEvents(rules) {
    $("#modality")?.addEventListener("change", () => {
      const mod = $("#modality").value || "CT";
      toggleContrast(mod === "CT");
      buildRegionOptions(rules, mod);
      buildContextChips(rules, mod);
      buildConditionList(rules, mod);
      syncPreview();
    });

    $("#region")?.addEventListener("change", onFormChange);
    $("#condition")?.addEventListener("input", onFormChange);
    $("#indication")?.addEventListener("input", syncPreview);
    document.querySelectorAll("#contrastGroup input").forEach((n) => n.addEventListener("change", syncPreview));

    $("#orderForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      // Hook for suggestion logic if needed later
      setStatus("Order suggestion updated.", "success");
      syncPreview();
    });

    document.getElementById("copyIndication")?.addEventListener("click", async () => {
      const text = $("#indication")?.value || "";
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text.trim());
        setStatus("Clinical indication copied to clipboard.", "success");
      } catch {
        setStatus("Unable to copy. Please select and copy manually.", "warn");
      }
    });
  }

  async function init() {
    const rules = await loadRules();
    const mod = $("#modality")?.value || "CT";
    toggleContrast(mod === "CT");
    buildRegionOptions(rules, mod);
    buildContextChips(rules, mod);
    buildConditionList(rules, mod);
    wireEvents(rules);
    syncPreview();
  }

  // Run after parse
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
