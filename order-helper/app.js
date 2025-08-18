/* =========================================================
   OraDigit Order Helper (PET/CT) — Select UI version
   - Robust rules loader with built-in fallback
   - Populates Context <select> and Condition datalist
   - Suggest builds header/reason from templates
   - Submit writes to Firestore if Firebase config present
   ========================================================= */

const els = {
  status: document.getElementById("status"),
  form: document.getElementById("orderForm"),
  indication: document.getElementById("indication"),
  modality: document.getElementById("modality"),
  region: document.getElementById("region"),
  context: document.getElementById("context"),
  condition: document.getElementById("condition"),
  conditionList: document.getElementById("conditionList"),
  errMsg: document.getElementById("errMsg"),
  results: document.getElementById("results"),
  outHeader: document.getElementById("outHeader"),
  outReason: document.getElementById("outReason"),
  outPrep: document.getElementById("outPrep"),
  outDocs: document.getElementById("outDocs"),
  outFlags: document.getElementById("outFlags"),
  suggestBtn: document.getElementById("suggestBtn"),
  submitBtn: document.getElementById("submitBtn"),
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
function setError(msg) { if (els.errMsg) els.errMsg.textContent = msg || ""; }

function normalizeModality(m) { return (m || "").replace(/\s+/g, "").replace("/", "").toUpperCase(); }
function normalizeRegion(r) { return (r || "").trim(); }

/* ---------- Built-in fallback (your current rules.json) ---------- */
const RULES_FALLBACK = [
  {
    "modality": "PET/CT",
    "region": "Skull base to mid-thigh",
    "contexts": ["staging", "restaging", "treatment response", "surveillance"],
    "keywords": ["lymphoma", "nsclc", "lung cancer", "breast cancer", "colorectal", "colon cancer", "melanoma", "head and neck", "hnscc", "gastric", "pancreatic"],
    "header": "PET/CT Skull Base to Mid-Thigh",
    "reasons": ["FDG PET/CT for {context} of {condition}; evaluate extent of disease, nodal involvement, and FDG-avid distant metastases."],
    "prep_notes": ["Fast 4–6 hours; avoid strenuous exercise for 24 hours.","Check blood glucose per facility protocol; avoid recent high-dose steroids if possible."],
    "supporting_docs": ["Recent clinic note documenting diagnosis and clinical question.","Prior imaging/report if available.","Therapy timeline (chemo/radiation/surgery) and relevant labs."],
    "flags": ["Recent G-CSF can increase marrow uptake.","Hyperglycemia may reduce FDG tumor-to-background contrast."],
    "tags": ["oncology-general"]
  },
  {
    "modality": "PET/CT",
    "region": "Whole body",
    "contexts": ["staging", "restaging", "surveillance"],
    "keywords": ["melanoma", "myeloma", "sarcoma", "vasculitis", "fever of unknown origin", "fuo"],
    "header": "PET/CT Whole Body",
    "reasons": ["FDG PET/CT whole body for {context} of {condition}; evaluate for extra-axial/extremity involvement and FDG-avid metastatic or inflammatory disease."],
    "prep_notes": ["Standard FDG fasting instructions.","Ensure patient warmth to limit brown fat uptake when possible."],
    "supporting_docs": ["Referring note with suspicion/diagnosis.","Any biopsy/pathology available.","Prior imaging for correlation."],
    "flags": ["Consider coverage of extremities for melanoma/myeloma.","Consider inflammatory patterns in vasculitis/FOU."],
    "tags": ["whole-body"]
  },
  {
    "modality": "PET",
    "region": "Brain",
    "contexts": ["dementia", "epilepsy"],
    "keywords": ["alzheim", "dementia", "frontotemporal", "ftd", "epilepsy", "seizure", "temporal lobe"],
    "header": "PET Brain FDG",
    "reasons": ["FDG brain PET to evaluate cerebral metabolic patterns in {condition}; correlate with clinical and prior imaging."],
    "prep_notes": ["Quiet, dim environment pre-injection.","For epilepsy protocols, follow ictal/interictal timing per local procedure."],
    "supporting_docs": ["Neurology note describing symptoms and clinical question.","Prior MRI/EEG as applicable."],
    "flags": ["FDG patterns vary by dementia subtype.","Medication/timing can affect epilepsy localization."],
    "tags": ["neuro"]
  },
  {
    "modality": "PET",
    "region": "Cardiac",
    "contexts": ["viability"],
    "keywords": ["viability", "ischemic cardiomyopathy", "hibernating myocardium"],
    "header": "PET Cardiac FDG Viability",
    "reasons": ["FDG PET to assess myocardial viability in ischemic cardiomyopathy; correlate with perfusion and echocardiographic findings."],
    "prep_notes": ["Cardiac viability glucose loading/insulin protocol per local SOP.","Coordinate with perfusion imaging if performed."],
    "supporting_docs": ["Cardiology note with revascularization question.","Prior echo/perfusion/coronary imaging reports."],
    "flags": ["Glycemic control critical for image quality.","Confirm compatibility with current therapies."],
    "tags": ["cardiac"]
  },
  {
    "modality": "PET/CT",
    "region": "Skull base to mid-thigh",
    "contexts": ["suspected infection"],
    "keywords": ["osteomyelitis", "prosthetic joint", "infection", "endocarditis", "fever of unknown origin", "fuo"],
    "header": "PET/CT Skull Base to Mid-Thigh",
    "reasons": ["FDG PET/CT to evaluate suspected infection/inflammation related to {condition}; assess extent of disease and potential sites of involvement."],
    "prep_notes": ["Standard FDG fasting; review recent antibiotic therapy that may impact findings."],
    "supporting_docs": ["Clinical notes with symptoms/duration.","Relevant labs (WBC, CRP/ESR), culture results if available.","Prior imaging for comparison."],
    "flags": ["Device/prosthesis can show inflammatory uptake; interpret in clinical context.","Consider tailored coverage if peripheral involvement suspected."],
    "tags": ["infection"]
  }
];

/* ---------- URL resolution + loader ---------- */
function buildRulesCandidates() {
  const origin = location.origin;
  const path = location.pathname;
  const baseDir = path.endsWith("/") ? path : path.substring(0, path.lastIndexOf("/") + 1);

  const abs = `${origin}/order-helper/data/rules.json`;
  const rel = new URL("data/rules.json", origin + baseDir).toString();
  const dot = new URL("./data/rules.json", location.href).toString();

  const v = `v=${Date.now()}`;
  const bust = (u) => (u.includes("?") ? `${u}&${v}` : `${u}?${v}`);

  return [abs, rel, dot].map(bust);
}

async function loadRules() {
  const candidates = buildRulesCandidates();
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch (_) {}
  }
  return null; // triggers fallback
}

/* ---------- State ---------- */
let RULES = [];
let CURRENT_RULES = []; // narrowed by modality/region (and optionally context)

/* ---------- Helpers to filter & populate ---------- */
function filterRulesByMR(ruleList) {
  const mod = normalizeModality(els.modality.value);
  const reg = normalizeRegion(els.region.value);

  let list = ruleList.filter(r => normalizeModality(r.modality) === mod);
  if (reg) {
    const exact = list.filter(r => (normalizeRegion(r.region).toLowerCase() === reg.toLowerCase()));
    if (exact.length) list = exact;
  }
  return list;
}

function uniqueSorted(arr) { return Array.from(new Set(arr)).sort((a,b)=> String(a).localeCompare(String(b))); }

function populateContextOptions(list) {
  els.context.innerHTML = "";
  const contexts = uniqueSorted(list.flatMap(r => r.contexts || []));
  if (!contexts.length) {
    els.context.innerHTML = `<option value="">No contexts available</option>`;
    els.context.disabled = true;
    return;
  }
  els.context.disabled = false;
  els.context.append(new Option("Select context…", ""));
  contexts.forEach(c => els.context.append(new Option(c, c)));
}

function populateConditionDatalist(list) {
  els.conditionList.innerHTML = "";
  const keywords = uniqueSorted(list.flatMap(r => r.keywords || []));
  keywords.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    els.conditionList.appendChild(opt);
  });
}

/* ---------- Templating ---------- */
function buildSuggestion(rule) {
  const context = els.context.value || "the clinical context";
  const condition = els.condition.value.trim() || els.indication.value.trim() || "the stated condition";

  const header = rule?.header || `${els.modality.value} ${els.region.value || ""}`.trim();

  // prefer the rule template if present; else fall back depending on modality
  const tpl = (rule?.reasons && rule.reasons[0])
    || (normalizeModality(els.modality.value) === "PETCT"
          ? "FDG PET/CT for {context} of {condition}."
          : `${els.modality.value} for {context} of {condition}.`);

  const reason = tpl.replace("{context}", context).replace("{condition}", condition);

  const prep  = rule?.prep_notes      || [];
  const docs  = rule?.supporting_docs || [];
  const flags = rule?.flags           || [];

  return { header, reason, prep, docs, flags };
}

function renderSuggestion(s) {
  els.outHeader.textContent = s.header;
  els.outReason.value = s.reason;
  els.outPrep.innerHTML  = s.prep.map(li => `<li>${li}</li>`).join("");
  els.outDocs.innerHTML  = s.docs.map(li => `<li>${li}</li>`).join("");
  els.outFlags.innerHTML = s.flags.map(li => `<li>${li}</li>`).join("");
  els.results.hidden = false;
  setStatus("Suggestion generated.", "success");
}

/* ---------- Copy / Print ---------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.", "success");
  } catch {
    setStatus("Could not copy to clipboard.", "error");
  }
}

/* ---------- Firebase Submit (optional) ---------- */
function initFirebaseIfPresent() {
  // You can define window.ORADIGIT_FIREBASE_CONFIG elsewhere to avoid touching this file.
  const cfg = window.ORADIGIT_FIREBASE_CONFIG || null;
  if (!cfg || !window.firebase) return null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    return {
      auth: firebase.auth(),
      db: firebase.firestore()
    };
  } catch (e) {
    console.warn("Firebase init failed:", e);
    return null;
  }
}

async function ensureAnonAuth(auth) {
  try {
    if (auth.currentUser) return auth.currentUser;
    const cred = await auth.signInAnonymously();
    return cred.user;
  } catch (e) {
    console.warn("Anonymous auth failed:", e);
    return null;
  }
}

async function submitOrder(db) {
  const payload = {
    modality: els.modality.value,
    region: els.region.value,
    context: els.context.value,
    condition: els.condition.value.trim(),
    indication: els.indication.value.trim(),
    suggestion: {
      header: els.outHeader.textContent,
      reason: els.outReason.value,
      prep: Array.from(els.outPrep.querySelectorAll("li")).map(li => li.textContent),
      docs: Array.from(els.outDocs.querySelectorAll("li")).map(li => li.textContent),
      flags: Array.from(els.outFlags.querySelectorAll("li")).map(li => li.textContent),
    },
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    path: location.pathname
  };
  const ref = await db.collection("petct_orders").add(payload);
  return ref.id;
}

/* ===========================
   Boot
   =========================== */
document.addEventListener("DOMContentLoaded", async () => {
  setStatus("Loading PET/CT rules…");

  // 1) Load rules from file or fallback
  try {
    const loaded = await loadRules();
    RULES = Array.isArray(loaded) && loaded.length ? loaded : RULES_FALLBACK;
    clearStatus();
  } catch {
    RULES = RULES_FALLBACK;
    setStatus("Using built-in rules.", "warn");
  }

  // 2) Narrow rules by current Modality/Region and populate Context + Condition datalist
  function refreshOptions() {
    CURRENT_RULES = filterRulesByMR(RULES);
    populateContextOptions(CURRENT_RULES);
    populateConditionDatalist(CURRENT_RULES);
  }
  refreshOptions();

  // 3) React to modality/region changes
  els.modality.addEventListener("change", () => {
    refreshOptions();
    setError("");
  });
  els.region.addEventListener("change", () => {
    refreshOptions();
    setError("");
  });

  // 4) Suggest (form submit)
  els.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    setError("");
    clearStatus();

    if (!els.modality.value) return setError("Please select Modality.");
    if (!els.region.value && normalizeModality(els.modality.value) !== "PETCT") return setError("Please select Region.");
    if (!els.context.value) return setError("Please choose a Context.");

    // best match rule: modality/region + context if available
    let candidates = CURRENT_RULES;
    if (els.context.value) {
      const ctx = els.context.value;
      const withCtx = candidates.filter(r => (r.contexts || []).includes(ctx));
      if (withCtx.length) candidates = withCtx;
    }

    const rule = candidates[0] || null;
    // For CT/MRI with no templates yet, rule may be null; buildSuggestion handles fallback strings
    const suggestion = buildSuggestion(rule);
    renderSuggestion(suggestion);
  });

  // 5) Submit Order (Firestore if available; otherwise show info)
  const fb = initFirebaseIfPresent();
  els.submitBtn.addEventListener("click", async () => {
    setError("");
    if (els.results.hidden) {
      return setError("Please click 'Suggest Order' first, review, then Submit.");
    }

    // If Firebase isn’t configured, provide a clean fallback
    if (!fb) {
      setStatus("No Firebase config detected. Showing a local preview of what would be submitted.", "warn");
      // Build preview payload and show it in console for now
      const preview = {
        modality: els.modality.value,
        region: els.region.value,
        context: els.context.value,
        condition: els.condition.value.trim(),
        indication: els.indication.value.trim(),
        header: els.outHeader.textContent,
        reason: els.outReason.value
      };
      console.info("Submit preview:", preview);
      setTimeout(() => setStatus("Preview created. Connect Firebase to store orders.", "success"), 150);
      return;
    }

    try {
      setStatus("Submitting order…");
      await ensureAnonAuth(fb.auth);
      const id = await submitOrder(fb.db);
      setStatus(`✅ Order submitted. Reference: ${id}`, "success");
      els.form.reset();
      els.results.hidden = true;
      refreshOptions(); // rebuild selects after reset
    } catch (e) {
      console.error(e);
      setStatus("Sorry—couldn’t save your order. Please try again.", "error");
    }
  });

  // 6) Copy/Print
  if (els.copyReasonBtn) els.copyReasonBtn.addEventListener("click", () => copyText(els.outReason.value || ""));
  if (els.copyAllBtn) els.copyAllBtn.addEventListener("click", () => {
    const text = [
      els.outHeader.textContent, "",
      "Reason for exam:", els.outReason.value, "",
      "Prep / Contraindications:",
      ...Array.from(els.outPrep.querySelectorAll("li")).map(li => `• ${li.textContent}`), "",
      "Supporting Docs:",
      ...Array.from(els.outDocs.querySelectorAll("li")).map(li => `• ${li.textContent}`), "",
      "Clinical Flags:",
      ...Array.from(els.outFlags.querySelectorAll("li")).map(li => `• ${li.textContent}`)
    ].join("\n");
    copyText(text);
  });
  if (els.printBtn) els.printBtn.addEventListener("click", () => window.print());
});
