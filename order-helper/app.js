/* =========================================================
   OraDigit Order Helper (PET/CT)
   Single responsibility in this step:
   - Load /order-helper/data/rules.json robustly
   - Populate Context chips
   - Build suggestions & show results
   ========================================================= */

const els = {
  status: document.getElementById("status"),
  form: document.getElementById("orderForm"),
  indication: document.getElementById("indication"),
  modality: document.getElementById("modality"),
  region: document.getElementById("region"),
  chips: document.getElementById("contextChips"),
  errMsg: document.getElementById("errMsg"),
  results: document.getElementById("results"),
  outHeader: document.getElementById("outHeader"),
  outReason: document.getElementById("outReason"),
  outPrep: document.getElementById("outPrep"),
  outDocs: document.getElementById("outDocs"),
  outFlags: document.getElementById("outFlags"),
  copyReasonBtn: document.getElementById("copyReasonBtn"),
  copyAllBtn: document.getElementById("copyAllBtn"),
  printBtn: document.getElementById("printBtn"),
};

function setStatus(msg, kind = "info") {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.className = `status ${kind}`;
}
function clearStatus() { setStatus(""); }
function setError(msg) {
  if (els.errMsg) els.errMsg.textContent = msg || "";
}

function normalizeModality(m) {
  return (m || "").replace(/\s+/g, "").replace("/", "").toUpperCase(); // "PET/CT" -> "PETCT"
}
function normalizeRegion(r) {
  return (r || "").trim();
}

/** Build an absolute path to /order-helper/data/rules.json reliably */
function buildRulesURL() {
  // If the site is at root, this is the most reliable path:
  const hard = `${location.origin}/order-helper/data/rules.json`;

  // Fallback: relative to current page (works if the page is actually /order-helper/)
  const soft = new URL("./data/rules.json", location.href).toString();

  return { hard, soft };
}

async function loadRules() {
  const { hard, soft } = buildRulesURL();

  // Try the hard path first
  try {
    let res = await fetch(hard, { cache: "no-store" });
    if (res.ok) return await res.json();
    // Try the soft/fallback
    res = await fetch(soft, { cache: "no-store" });
    if (res.ok) return await res.json();
    throw new Error("HTTP error");
  } catch (e) {
    // Show friendly message; don't dump all attempted paths to the UI
    throw new Error("Could not load PET/CT rules. Please refresh or contact support.");
  }
}

let RULES = [];
let selectedContext = "";

/** Render context "chips" from rules (union of all contexts for the selected modality) */
function renderContextChips() {
  if (!els.chips) return;
  els.chips.innerHTML = "";

  const currentMod = normalizeModality(els.modality.value);
  const regionset = new Set(); // Optional: could filter by region later
  const contextSet = new Set();

  RULES.forEach(item => {
    const itemMod = normalizeModality(item.modality);
    if (itemMod !== currentMod) return;

    regionset.add(item.region);
    (item.contexts || []).forEach(c => contextSet.add(c));
  });

  // If region is "Auto", do nothing special for now; otherwise we could constrain contexts by region
  Array.from(contextSet).sort().forEach(ctx => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "oh-chip";
    btn.textContent = ctx;
    btn.setAttribute("aria-pressed", String(ctx === selectedContext));
    btn.addEventListener("click", () => {
      selectedContext = ctx;
      // Update pressed state
      Array.from(els.chips.querySelectorAll(".oh-chip")).forEach(ch => {
        ch.setAttribute("aria-pressed", String(ch.textContent === selectedContext));
      });
    });
    els.chips.appendChild(btn);
  });

  // If nothing rendered, show a helper
  if (!els.chips.children.length) {
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = "No contexts available for the current selection.";
    els.chips.appendChild(span);
  }
}

/** Given selected inputs, find the best matching rule(s) */
function findMatchingRules() {
  const mod = normalizeModality(els.modality.value);
  const reg = normalizeRegion(els.region.value);
  const ctx = selectedContext || ""; // may be empty if user didn't pick chips

  let candidates = RULES.filter(r => normalizeModality(r.modality) === mod);

  // If a region is chosen (and not "Auto"), prefer those
  if (reg) {
    const exact = candidates.filter(r => normalizeRegion(r.region).toLowerCase() === reg.toLowerCase());
    if (exact.length) candidates = exact;
  }

  // If a context is chosen, prefer those that list it
  if (ctx) {
    const withCtx = candidates.filter(r => (r.contexts || []).map(String).includes(ctx));
    if (withCtx.length) candidates = withCtx;
  }

  return candidates;
}

/** Produce a suggestion payload (header, reason, lists) */
function buildSuggestion(rule, context, indicationText) {
  const condition = (indicationText || "").trim() || "the stated condition";
  const ctx = context || "the clinical context";

  const header = rule.header || `${rule.modality} ${rule.region}`;
  // Pick first reason template if present
  const tpl = (rule.reasons && rule.reasons[0]) || "FDG PET/CT for {context} of {condition}.";
  const reason = tpl.replace("{context}", ctx).replace("{condition}", condition);

  const prep = rule.prep_notes || [];
  const docs = rule.supporting_docs || [];
  const flags = rule.flags || [];

  return { header, reason, prep, docs, flags };
}

/** Render suggestion to the page */
function renderSuggestion(s) {
  els.outHeader.textContent = s.header;
  els.outReason.value = s.reason;

  els.outPrep.innerHTML = s.prep.map(li => `<li>${li}</li>`).join("");
  els.outDocs.innerHTML = s.docs.map(li => `<li>${li}</li>`).join("");
  els.outFlags.innerHTML = s.flags.map(li => `<li>${li}</li>`).join("");

  els.results.hidden = false;
  setStatus("Suggestion generated.", "success");
}

/** Copy helpers */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.", "success");
  } catch {
    setStatus("Could not copy to clipboard.", "error");
  }
}

/* ===========================
   Boot
   =========================== */
document.addEventListener("DOMContentLoaded", async () => {
  setStatus("Loading PET/CT rules…");

  try {
    RULES = await loadRules();
    clearStatus();
  } catch (e) {
    setStatus(e.message, "error");
    // We still allow manual typing; just no rule-driven chips
  }

  renderContextChips();

  els.modality.addEventListener("change", () => {
    selectedContext = "";
    renderContextChips();
  });
  els.region.addEventListener("change", () => {
    // Could filter contexts by region in the future
  });

  // Form submit (Suggest)
  els.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    setError("");
    setStatus("");

    const indication = els.indication.value.trim();
    const mod = normalizeModality(els.modality.value);

    // Basic required fields
    const missing = [];
    if (!mod) missing.push("Modality");
    if (!indication) missing.push("Clinical indication");
    if (missing.length) {
      setError(`Please complete: ${missing.join(", ")}.`);
      return;
    }

    const candidates = findMatchingRules();
    if (!candidates.length) {
      setStatus("No matching rule found for the current selection. Try another Region or Context.", "warn");
      return;
    }

    // Choose the first candidate for now (could be smarter later)
    const s = buildSuggestion(candidates[0], selectedContext, indication);
    renderSuggestion(s);
  });

  // Copy buttons
  if (els.copyReasonBtn) {
    els.copyReasonBtn.addEventListener("click", () => {
      copyText(els.outReason.value || "");
    });
  }
  if (els.copyAllBtn) {
    els.copyAllBtn.addEventListener("click", () => {
      const text = [
        els.outHeader.textContent,
        "",
        "Reason for exam:",
        els.outReason.value,
        "",
        "Prep / Contraindications:",
        ...Array.from(els.outPrep.querySelectorAll("li")).map(li => `• ${li.textContent}`),
        "",
        "Supporting Docs:",
        ...Array.from(els.outDocs.querySelectorAll("li")).map(li => `• ${li.textContent}`),
        "",
        "Clinical Flags:",
        ...Array.from(els.outFlags.querySelectorAll("li")).map(li => `• ${li.textContent}`),
      ].join("\n");
      copyText(text);
    });
  }
  if (els.printBtn) {
    els.printBtn.addEventListener("click", () => window.print());
  }
});
