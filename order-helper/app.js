  /* =========================================================
   OraDigit Order Helper (PET/CT, CT, MRI)
   - Robust rules loader (meta hint + auto base + auth subdomain)
   - Chips UI for Context (matches index.html)
   - Keyword/context/region scoring with safe fallback
   - Copy / Copy All / Print
   - Optional Firebase submit (no-op if not configured)
   ========================================================= */

/* ---------- DOM refs ---------- */
const els = {
  status:        document.getElementById("status"),
  form:          document.getElementById("orderForm"),
  indication:    document.getElementById("indication"),
  modality:      document.getElementById("modality"),
  region:        document.getElementById("region"),
  contextChips:  document.getElementById("contextChips"),
  condition:     document.getElementById("condition"),
  errMsg:        document.getElementById("errMsg"),
  results:       document.getElementById("results"),
  outHeader:     document.getElementById("outHeader"),
  outReason:     document.getElementById("outReason"),
  outPrep:       document.getElementById("outPrep"),
  outDocs:       document.getElementById("outDocs"),
  outFlags:      document.getElementById("outFlags"),
  suggestBtn:    document.getElementById("suggestBtn"),
  submitBtn:     document.getElementById("submitBtn"),
  copyReasonBtn: document.getElementById("copyReasonBtn"),
  copyAllBtn:    document.getElementById("copyAllBtn"),
  printBtn:      document.getElementById("printBtn"),
  dbg:           document.getElementById("dbg"),
};

/* ---------- UI helpers ---------- */
function setStatus(msg, kind = "info") {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.className = `status ${kind}`;
}
function clearStatus(){ setStatus(""); }
function setError(msg){ if (els.errMsg) els.errMsg.textContent = msg || ""; }
function dbg(msg){ if (els.dbg) els.dbg.textContent = msg; console.log(msg); }

function normalizeModality(m){ return (m || "").replace(/\s+/g,"").replace("/","").toUpperCase(); }
function normalizeRegion(r){ return (r || "").trim(); }

/* ---------- Context chips ---------- */
const DEFAULT_CONTEXTS = [
  "staging","restaging","treatment response","surveillance",
  "suspected infection","dementia","epilepsy","viability","oncology","neuro"
];

function initChips() {
  if (!els.contextChips) return;
  els.contextChips.innerHTML = "";
  DEFAULT_CONTEXTS.forEach(ctx => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "oh-chip";
    btn.textContent = ctx;
    btn.setAttribute("aria-pressed","false");
    btn.addEventListener("click", () => {
      const pressed = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", String(!pressed));
    });
    els.contextChips.appendChild(btn);
  });
}
function getSelectedContexts(){
  return [...document.querySelectorAll('.oh-chip[aria-pressed="true"]')]
    .map(b => b.textContent.toLowerCase());
}

/* ---------- Built-in PET/CT fallback ---------- */
const RULES_FALLBACK = [
  {
    modality: "PET/CT",
    region: "Skull base to mid-thigh",
    contexts: ["staging","restaging","treatment response","surveillance"],
    keywords: ["lymphoma","nsclc","lung cancer","breast cancer","colorectal","colon cancer","melanoma","head and neck","hnscc","gastric","pancreatic"],
    header: "PET/CT Skull Base to Mid-Thigh",
    reasons: ["FDG PET/CT for {context} of {condition}; evaluate extent of disease, nodal involvement, and FDG-avid distant metastases."],
    prep_notes: ["Fast 4–6 hours; avoid strenuous exercise for 24 hours.","Check blood glucose per facility protocol; avoid recent high-dose steroids if possible."],
    supporting_docs: ["Recent clinic note documenting diagnosis and clinical question.","Prior imaging/report if available.","Therapy timeline (chemo/radiation/surgery) and relevant labs."],
    flags: ["Recent G-CSF can increase marrow uptake.","Hyperglycemia may reduce FDG tumor-to-background contrast."],
    tags: ["oncology-general"]
  },
  {
    modality: "PET/CT",
    region: "Whole body",
    contexts: ["staging","restaging","surveillance"],
    keywords: ["melanoma","myeloma","sarcoma","vasculitis","fever of unknown origin","fuo"],
    header: "PET/CT Whole Body",
    reasons: ["FDG PET/CT whole body for {context} of {condition}; evaluate for extra-axial/extremity involvement and FDG-avid metastatic or inflammatory disease."],
    prep_notes: ["Standard FDG fasting instructions.","Ensure patient warmth to limit brown fat uptake when possible."],
    supporting_docs: ["Referring note with suspicion/diagnosis.","Any biopsy/pathology available.","Prior imaging for correlation."],
    flags: ["Consider coverage of extremities for melanoma/myeloma.","Consider inflammatory patterns in vasculitis/FOU."],
    tags: ["whole-body"]
  },
  {
    modality: "PET",
    region: "Brain",
    contexts: ["dementia","epilepsy"],
    keywords: ["alzheim","dementia","frontotemporal","ftd","epilepsy","seizure","temporal lobe"],
    header: "PET Brain FDG",
    reasons: ["FDG brain PET to evaluate cerebral metabolic patterns in {condition}; correlate with clinical and prior imaging."],
    prep_notes: ["Quiet, dim environment pre-injection.","For epilepsy protocols, follow ictal/interictal timing per local procedure."],
    supporting_docs: ["Neurology note describing symptoms and clinical question.","Prior MRI/EEG as applicable."],
    flags: ["FDG patterns vary by dementia subtype.","Medication/timing can affect epilepsy localization."],
    tags: ["neuro"]
  },
  {
    modality: "PET",
    region: "Cardiac",
    contexts: ["viability"],
    keywords: ["viability","ischemic cardiomyopathy","hibernating myocardium"],
    header: "PET Cardiac FDG Viability",
    reasons: ["FDG PET to assess myocardial viability in ischemic cardiomyopathy; correlate with perfusion and echocardiographic findings."],
    prep_notes: ["Cardiac viability glucose loading/insulin protocol per local SOP.","Coordinate with perfusion imaging if performed."],
    supporting_docs: ["Cardiology note with revascularization question.","Prior echo/perfusion/coronary imaging reports."],
    flags: ["Glycemic control critical for image quality.","Confirm compatibility with current therapies."],
    tags: ["cardiac"]
  },
  {
    modality: "PET/CT",
    region: "Skull base to mid-thigh",
    contexts: ["suspected infection"],
    keywords: ["osteomyelitis","prosthetic joint","infection","endocarditis","fever of unknown origin","fuo"],
    header: "PET/CT Skull Base to Mid-Thigh",
    reasons: ["FDG PET/CT to evaluate suspected infection/inflammation related to {condition}; assess extent of disease and potential sites of involvement."],
    prep_notes: ["Standard FDG fasting; review recent antibiotic therapy that may impact findings."],
    supporting_docs: ["Clinical notes with symptoms/duration.","Relevant labs (WBC, CRP/ESR), culture results if available.","Prior imaging for comparison."],
    flags: ["Device/prosthesis can show inflammatory uptake; interpret in clinical context.","Consider tailored coverage if peripheral involvement suspected."],
    tags: ["infection"]
  }
];

/* ---------- Rules loader ---------- */
// Optional meta hint for PET/CT rules
const META_RULES_URL =
  document.querySelector('meta[name="oh-rules-path"]')?.content || null;

function basePath() {
  // e.g., "/order-helper/"
  const p = location.pathname.endsWith('/')
    ? location.pathname
    : location.pathname.replace(/[^/]+$/, '');
  return p;
}

function filenameForModality(mod) {
  const m = normalizeModality(mod);
  if (m === "CT")  return "ct_rules.json";
  if (m === "MRI") return "mri_rules.json";
  return "rules.json"; // PET/CT default
}

function candidateURLs(modality) {
  const file = filenameForModality(modality);
  const base = basePath(); // same-origin base dir

  // If a meta URL is present and points at rules.json, also try it with the other file names
  const fromMeta = [];
  if (META_RULES_URL) {
    try {
      const u = new URL(META_RULES_URL, location.origin);
      const parts = u.pathname.split('/');
      parts.pop(); // drop filename
      const metaDir = parts.join('/') + '/';
      fromMeta.push(`${metaDir}${file}`);
    } catch { /* ignore */ }
  }

  const bust = (u) => (u.includes('?') ? `${u}&t=${Date.now()}` : `${u}?t=${Date.now()}`);

  const candidates = [
    // 1) same-directory relative
    `${base}data/${file}`,
    `./data/${file}`,

    // 2) hardcoded known app root
    `/order-helper/data/${file}`,

    // 3) meta-derived sibling
    ...fromMeta,

    // 4) auth subdomain (requires CORS headers there)
    `https://auth.oradigit.com/order-helper/data/${file}`,
  ];

  return candidates.map(bust);
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let txt = await res.text();
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  if (txt.trim().startsWith('<!DOCTYPE')) throw new Error('Got HTML (likely 404)');
  return JSON.parse(txt);
}

async function loadRulesFor(modality) {
  const candidates = candidateURLs(modality);
  let lastErr = null;
  for (const url of candidates) {
    try {
      dbg(`Trying ${url} …`);
      const json = await fetchJSON(url);
      if (Array.isArray(json) && json.length) {
        dbg(`✅ Loaded ${json.length} rule(s) from ${url}`);
        return json;
      }
      // allow empty arrays for CT/MRI MVP
      if (Array.isArray(json)) {
        dbg(`⚠️ Loaded empty rule set from ${url}`);
        return json;
      }
    } catch (e) {
      lastErr = e;
      console.warn(`Failed ${url}: ${e.message}`);
    }
  }
  // Fallback only for PET/CT
  if (normalizeModality(modality) === "PETCT") {
    dbg("Using built-in PET/CT fallback rules.");
    return RULES_FALLBACK;
  }
  throw new Error(`Failed to load rules for ${modality}. Last error: ${lastErr?.message || 'unknown'}`);
}

/* ---------- Scoring & suggestion ---------- */
function scoreRule(rule, indication, region, contexts) {
  let score = 0;
  const text = (indication || "").toLowerCase();

  const hits = (rule.keywords || []).filter(k => text.includes(String(k).toLowerCase()));
  score += hits.length * 5;

  const ctxOverlap = (rule.contexts || []).filter(c => contexts.includes(String(c).toLowerCase())).length;
  score += ctxOverlap * 3;

  if (region && rule.region?.toLowerCase() === region.toLowerCase()) score += 4;

  if (/cancer|carcinoma|lymphoma|sarcoma|melanoma|tumou?r|malign/.test(text)
      && Array.isArray(rule.tags) && rule.tags.includes('oncology-general')) {
    score += 2;
  }
  return { score, hits };
}

function pickBestRule(rules, indication, region, contexts) {
  let best = null;
  for (const rule of rules) {
    const { score, hits } = scoreRule(rule, indication, region, contexts);
    if (!best || score > best.score) best = { rule, score, hits };
  }
  if (!best || best.score < 3) {
    const fallback = rules.find(r => Array.isArray(r.tags) && r.tags.includes('oncology-general')) || rules[0];
    return { rule: fallback || null, hits: [] };
  }
  return best;
}

function fillTemplate(tpl, { context, condition }) {
  return String(tpl)
    .replaceAll('{context}', context || 'staging')
    .replaceAll('{condition}', condition || 'the stated condition');
}

function deriveConditionFrom(hits, conditionInput, indication){
  if (conditionInput && conditionInput.trim()) return conditionInput.trim();
  if (hits && hits.length) return String(hits[0]);
  if (indication && indication.trim()) return indication.trim();
  return 'the stated condition';
}

function listToText(id) {
  return [...document.querySelectorAll(`#${id} li`)]
    .map(li => `• ${li.textContent}`).join('\n');
}

function buildBundle() {
  const header = els.outHeader?.textContent || '';
  const reason = els.outReason?.value || '';
  return `Study Header:
${header}

Reason for Exam:
${reason}

Prep / Contraindications:
${listToText('outPrep')}

Supporting Docs:
${listToText('outDocs')}

Clinical Flags:
${listToText('outFlags')}
`;
}

function renderResult(ruleMatch, userRegion, contexts) {
  if (!ruleMatch || !ruleMatch.rule) {
    setError('No matching rule found.');
    dbg('No matching rule found.');
    return;
  }
  const rule = ruleMatch.rule;
  const chosenRegion = userRegion || rule.region || 'Skull base to mid-thigh';
  const ruleModality = rule.modality || els.modality.value || 'PET/CT';
  const header = rule.header || `${ruleModality} ${chosenRegion}`;

  const condition = deriveConditionFrom(ruleMatch.hits, els.condition?.value, els.indication?.value);
  const ctx = contexts[0] || (Array.isArray(rule.contexts) && rule.contexts[0]) || 'staging';

  const reasonTpl = (Array.isArray(rule.reasons) && rule.reasons[0])
    || (normalizeModality(els.modality.value) === "PETCT"
          ? "FDG PET/CT for {context} of {condition}; evaluate extent of disease and FDG-avid metastases."
          : `${els.modality.value} for {context} of {condition}.`);

  const reason = fillTemplate(reasonTpl, { context: ctx, condition });

  els.outHeader.textContent = header;
  els.outReason.value = reason;

  const ulPrep  = els.outPrep;
  const ulDocs  = els.outDocs;
  const ulFlags = els.outFlags;
  [ulPrep, ulDocs, ulFlags].forEach(ul => { if (ul) ul.innerHTML = ''; });

  (rule.prep_notes || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulPrep?.appendChild(li); });
  (rule.supporting_docs || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulDocs?.appendChild(li); });
  (rule.flags || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulFlags?.appendChild(li); });

  els.results.hidden = false;
  setStatus('Suggestion generated.', 'success');
  dbg('Rendered suggestion.');
}

/* ---------- Copy / Print ---------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); setStatus('Copied to clipboard.', 'success'); }
  catch { setStatus('Could not copy to clipboard.', 'error'); }
}

/* ---------- Optional Firebase submit ---------- */
function initFirebaseIfPresent() {
  const cfg = window.ORADIGIT_FIREBASE_CONFIG || null;
  if (!cfg || !window.firebase) return null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    return { auth: firebase.auth(), db: firebase.firestore() };
  } catch (e) {
    console.warn("Firebase init failed:", e);
    return null;
  }
}
async function ensureAnonAuth(auth) {
  try {
    if (auth.currentUser) return auth.currentUser;
    const cred = await auth.signInAnonymously(); return cred.user;
  } catch (e) { console.warn("Anonymous auth failed:", e); return null; }
}
async function submitOrder(db) {
  const payload = {
    modality: els.modality.value,
    region: els.region.value,
    contexts: getSelectedContexts(),
    condition: els.condition?.value?.trim() || '',
    indication: els.indication?.value?.trim() || '',
    suggestion: {
      header: els.outHeader.textContent,
      reason: els.outReason.value,
      prep:  [...document.querySelectorAll('#outPrep li')].map(li=>li.textContent),
      docs:  [...document.querySelectorAll('#outDocs li')].map(li=>li.textContent),
      flags: [...document.querySelectorAll('#outFlags li')].map(li=>li.textContent)
    },
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    path: location.pathname
  };
  const ref = await db.collection("petct_orders").add(payload);
  return ref.id;
}

/* ---------- Global state ---------- */
let RULES = []; // currently loaded rules for selected modality

/* ---------- Wire & Boot ---------- */
function wireEvents() {
  // Submit = Suggest
  els.form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    setError("");
    clearStatus();

    const indication = els.indication?.value?.trim() || '';
    const region     = els.region?.value?.trim() || '';
    const contexts   = getSelectedContexts();

    if (!RULES.length) return setError("Rules not loaded yet.");
    const match = pickBestRule(RULES, indication, region, contexts);
    renderResult(match, region, contexts);
  });

  // Buttons
  els.copyReasonBtn?.addEventListener('click', () => copyText(els.outReason?.value || ''));
  els.copyAllBtn?.addEventListener('click', () => copyText(buildBundle()));
  els.printBtn?.addEventListener('click', () => window.print());

  // Optional Submit (Firestore)
  const fb = initFirebaseIfPresent();
  els.submitBtn?.addEventListener('click', async () => {
    setError("");
    if (els.results.hidden) return setError("Please click 'Suggest Order' first.");
    if (!fb) {
      setStatus("No Firebase config detected. This would submit to Firestore.", "warn");
      console.info("Submit preview:", buildBundle());
      return;
    }
    try {
      setStatus("Submitting order…");
      await ensureAnonAuth(fb.auth);
      const id = await submitOrder(fb.db);
      setStatus(`✅ Order submitted. Reference: ${id}`, "success");
    } catch (e) {
      console.error(e);
      setStatus("Sorry—couldn’t save your order. Please try again.", "error");
    }
  });

  // Reload rules when modality changes
  els.modality?.addEventListener('change', async (e) => {
    try {
      RULES = await loadRulesFor(e.target.value);
      els.results.hidden = true;
      setError("");
      dbg(`✅ Reloaded ${RULES.length} rules for ${e.target.value}`);
    } catch (err) {
      setError(err.message);
      dbg('❌ ' + err.message);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initChips();
  setStatus("Loading rules…");
  try {
    const initial = els.modality?.value || 'PET/CT';
    RULES = await loadRulesFor(initial);
    clearStatus();
    dbg(`✅ Loaded ${RULES.length} rules for ${initial}`);
  } catch (err) {
    // Only PET/CT falls back; CT/MRI throws
    setError(err.message);
    setStatus("Using built-in PET/CT rules (if PET/CT selected).", "warn");
    if (normalizeModality(els.modality?.value) === "PETCT") {
      RULES = RULES_FALLBACK;
    } else {
      RULES = [];
    }
  }
  wireEvents();
});

