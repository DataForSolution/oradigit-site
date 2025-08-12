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

function initChips() {
  const wrap = document.getElementById('contextChips');
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
  return [...document.querySelectorAll('.oh-chip[aria-pressed="true"]')].map(b => b.textContent.toLowerCase());
}

async function loadLocalRules(modality) {
  const path = LOCAL_RULE_PATHS[modality] || LOCAL_RULE_PATHS["PET/CT"];
  const res = await fetch(path, { cache: 'no-store' });
  return await res.json();
}

function scoreRule(rule, indication, region, contexts) {
  let score = 0;
  const text = indication.toLowerCase();
  const hits = (rule.keywords || []).filter(k => text.includes(k.toLowerCase()));
  score += hits.length * 5;
  const ctxOverlap = (rule.contexts || []).filter(c => contexts.includes(c.toLowerCase())).length;
  score += ctxOverlap * 3;
  if (region && rule.region?.toLowerCase() === region.toLowerCase()) score += 4;
  if (/cancer|carcinoma|lymphoma|sarcoma|melanoma|tumor|malign/.test(text) && rule.tags?.includes('oncology-general')) score += 2;
  return { score, hits };
}

function pickBestRule(indication, region, contexts) {
  let best = null;
  for (const rule of RULES) {
    const { score, hits } = scoreRule(rule, indication, region, contexts);
    if (!best || score > best.score) best = { rule, score, hits };
  }
  if (!best || best.score < 3) {
    const def = RULES.find(r => r.tags?.includes('oncology-general')) || RULES[0];
    return { rule: def, hits: [] };
  }
  return best;
}

function fillTemplate(tpl, { context, condition }) {
  return tpl.replaceAll('{context}', context || 'staging').replaceAll('{condition}', condition || 'the stated condition');
}
function deriveConditionFromHits(hits){ return (hits && hits.length) ? hits[0] : 'the stated condition'; }

function renderResult(match, userRegion, contexts) {
  const rule = match.rule || {};
  const chosenRegion = userRegion || rule.region || 'Skull base to mid-thigh';
  const header = rule.header || `PET/CT ${chosenRegion}`;
  const ctx = contexts[0] || (rule.contexts && rule.contexts[0]) || 'staging';
  const condition = deriveConditionFromHits(match.hits);

  const reasonTpl = (rule.reasons && rule.reasons[0]) ||
    'FDG PET/CT for {context} of {condition}; evaluate extent of disease and FDG-avid metastases.';
  const reason = fillTemplate(reasonTpl, { context: ctx, condition });

  document.getElementById('outHeader').textContent = header;
  document.getElementById('outReason').value = reason;

  const ulPrep = document.getElementById('outPrep');
  const ulDocs = document.getElementById('outDocs');
  const ulFlags = document.getElementById('outFlags');
  [ulPrep, ulDocs, ulFlags].forEach(ul => ul.innerHTML = '');

  (rule.prep_notes || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulPrep.appendChild(li); });
  (rule.supporting_docs || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulDocs.appendChild(li); });
  (rule.flags || []).forEach(x => { const li = document.createElement('li'); li.textContent = x; ulFlags.appendChild(li); });

  document.getElementById('results').hidden = false;
}

function copy(text){ navigator.clipboard.writeText(text).catch(()=>{}); }

function wireEvents() {
  document.getElementById('suggestBtn').addEventListener('click', () => {
    const indication = document.getElementById('indication').value.trim();
    const region = document.getElementById('region').value.trim();
    const contexts = getSelectedContexts();
    const match = pickBestRule(indication, region, contexts);
    renderResult(match, region, contexts);
  });
  document.getElementById('copyReasonBtn').addEventListener('click', () => copy(document.getElementById('outReason').value));
  document.getElementById('copyAllBtn').addEventListener('click', () => {
    const header = document.getElementById('outHeader').textContent;
    const reason = document.getElementById('outReason').value;
    const listToText = (id) => [...document.querySelectorAll(`#${id} li`)].map(li=>`• ${li.textContent}`).join('\n');
    const bundle = `Study Header:\n${header}\n\nReason for Exam:\n${reason}\n\nPrep / Contraindications:\n${listToText('outPrep')}\n\nSupporting Docs:\n${listToText('outDocs')}\n\nClinical Flags:\n${listToText('outFlags')}\n`;
    copy(bundle);
  });
  document.getElementById('printBtn').addEventListener('click', ()=>window.print());

  // reload rules when modality changes
  document.getElementById('modality').addEventListener('change', async (e) => {
    RULES = await loadLocalRules(e.target.value);
    document.getElementById('results').hidden = true;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initChips();
  RULES = await loadLocalRules(document.getElementById('modality').value);
  wireEvents();
});
