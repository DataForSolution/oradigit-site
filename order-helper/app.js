// ----- Config -----
const DEFAULT_CONTEXTS = [
  "staging","restaging","treatment response","surveillance",
  "suspected infection","dementia","epilepsy","viability","oncology","neuro"
];

let RULES = [];
const LOCAL_RULE_PATHS = {
  "PET/CT": "./data/rules.json",
  "CT": "./data/ct_rules.json",
  "MRI": "./data/mri_rules.json"
};

// ----- Utilities -----
function byId(id) { return document.getElementById(id); }

// Small debug helper: writes to #dbg (if present) and console
function dbg(msg) {
  const el = byId('dbg');
  if (el) el.textContent = msg;
  console.log(msg);
}

function showError(msg = "") {
  const el = byId('errMsg');
  if (el) el.textContent = msg;
  if (msg) console.error(msg);
}

function initChips() {
  const wrap = byId('contextChips');
  if (!wrap) return;
  wrap.innerHTML = "";
  DEFAULT_CONTEXTS.forEach(ctx => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oh-chip';
    btn.textContent = ctx;
    btn.setAttribute('aria-pressed','false');
    btn.addEventListener('click', ()=>{
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!pressed));
    });
    wrap.appendChild(btn);
  });
}

function getSelectedContexts() {
  return [...document.querySelectorAll('.oh-chip[aria-pressed="true"]')]
    .map(b => b.textContent.toLowerCase());
}
async function loadLocalRules(modality) {
  const candidatesByMod = {
    "PET/CT": ["./data/rules.json", "/order-helper/data/rules.json", "/data/rules.json"],
    "CT":     ["./data/ct_rules.json", "/order-helper/data/ct_rules.json", "/data/ct_rules.json"],
    "MRI":    ["./data/mri_rules.json", "/order-helper/data/mri_rules.json", "/data/mri_rules.json"]
  };
  const candidates = candidatesByMod[modality] || candidatesByMod["PET/CT"];

  let lastErr = null;
  for (const path of candidates) {
    try {
      dbg(`Trying ${path} …`);
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let txt = await res.text();
      if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
      if (txt.trim().startsWith('<!DOCTYPE')) throw new Error("Got HTML (likely 404 page)");
      const json = JSON.parse(txt);
      dbg(`✅ Loaded ${Array.isArray(json) ? json.length : 0} rule(s) from ${path}`);
      return json;
    } catch (e) {
      lastErr = e;
      console.warn(`Failed ${path}: ${e.message}`);
    }
  }
  throw new Error(`Failed to load rules for ${modality}. Tried: ${candidates.join(", ")}. Last error: ${lastErr?.message || 'unknown'}`);
}


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

function pickBestRule(indication, region, contexts) {
  let best = null;
  for (const rule of RULES) {
    const { score, hits } = scoreRule(rule, indication, region, contexts);
    if (!best || score > best.score) best = { rule, score, hits };
  }
  if (!best || best.score < 3) {
    const fallback = RULES.find(r => Array.isArray(r.tags) && r.tags.includes('oncology-general')) || RULES[0];
    return { rule: fallback, hits: [] };
  }
  return best;
}

function fillTemplate(tpl, { context, condition }) {
  return String(tpl)
    .replaceAll('{context}', context || 'staging')
    .replaceAll('{condition}', condition || 'the stated condition');
}

function deriveConditionFromHits(hits){
  return (hits && hits.length) ? String(hits[0]) : 'the stated condition';
}

function renderResult(match, userRegion, contexts) {
  if (!match || !match.rule) {
    showError('No matching rule found.');
    dbg('No matching rule found.');
    return;
  }
  const rule = match.rule;
  const chosenRegion = userRegion || rule.region || 'Skull base to mid-thigh';

  // Default header if missing; try to reflect PET vs PET/CT if provided
  const ruleModality = rule.modality || 'PET/CT';
  const header = rule.header || `${ruleModality} ${chosenRegion}`;

  const ctx = contexts[0] || (Array.isArray(rule.contexts) && rule.contexts[0]) || 'staging';
  const condition = deriveConditionFromHits(match.hits);
  const reasonTpl = (Array.isArray(rule.reasons) && rule.reasons[0])
    || 'FDG PET/CT for {context} of {condition}; evaluate extent of disease and FDG-avid metastases.';
  const reason = fillTemplate(reasonTpl, { context: ctx, condition });

  byId('outHeader').textContent = header;
  byId('outReason').value = reason;

  const ulPrep  = byId('outPrep');
  const ulDocs  = byId('outDocs');
  const ulFlags = byId('outFlags');
  [ulPrep, ulDocs, ulFlags].forEach(ul => { if (ul) ul.innerHTML = ''; });

  (rule.prep_notes || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulPrep?.appendChild(li); });
  (rule.supporting_docs || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulDocs?.appendChild(li); });
  (rule.flags || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulFlags?.appendChild(li); });

  const results = byId('results');
  if (results) results.hidden = false;

  showError('');
  dbg('Rendered suggestion.');
}

function copy(text){ navigator.clipboard.writeText(text).catch(()=>{}); }

// ----- Wire UI -----
function wireEvents() {
  // Handle both form submit and button click
  const form = byId('orderForm');
  const handler = (evt) => {
    evt?.preventDefault?.();

    const indication = byId('indication')?.value.trim() || '';
    const region     = byId('region')?.value.trim() || '';
    const contexts   = getSelectedContexts();

    if (!RULES || !RULES.length) {
      showError('Rules not loaded yet.');
      dbg('Suggest clicked but rules not loaded yet.');
      return;
    }
    dbg(`Suggest clicked with contexts: ${JSON.stringify(contexts)}`);
    const match = pickBestRule(indication, region, contexts);
    renderResult(match, region, contexts);
  };

  form?.addEventListener('submit', handler);
  byId('suggestBtn')?.addEventListener('click', handler);

  byId('copyReasonBtn')?.addEventListener('click', () => copy(byId('outReason')?.value || ''));
  byId('copyAllBtn')?.addEventListener('click', () => {
    const header = byId('outHeader')?.textContent || '';
    const reason = byId('outReason')?.value || '';
    const listToText = (id) => [...document.querySelectorAll(`#${id} li`)].map(li=>`• ${li.textContent}`).join('\n');
    const bundle =
`Study Header:
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
    copy(bundle);
  });
  byId('printBtn')?.addEventListener('click', ()=>window.print());

  // Reload rules when modality changes
  byId('modality')?.addEventListener('change', async (e) => {
    try {
      RULES = await loadLocalRules(e.target.value);
      const results = byId('results');
      if (results) results.hidden = true;
      showError('');
      dbg(`✅ Reloaded ${RULES.length} rules for ${e.target.value}`);
    } catch (err) {
      showError(err.message);
      dbg('❌ ' + err.message);
    }
  });
}

// ----- Bootstrap -----
document.addEventListener('DOMContentLoaded', async () => {
  initChips();
  try {
    const initialModality = byId('modality')?.value || 'PET/CT';
    RULES = await loadLocalRules(initialModality);
    showError('');
    dbg(`✅ Loaded ${RULES.length} rules for ${initialModality}`);
  } catch (err) {
    showError(err.message);
    dbg('❌ ' + err.message);
  }
  wireEvents();
});
