// Simple, readable JS with a tiny rules "engine"
const DEFAULT_CONTEXTS = [
  "staging", "restaging", "treatment response",
  "surveillance", "suspected infection", "dementia",
  "epilepsy", "viability"
];

let RULES = [];

function initChips() {
  const wrap = document.getElementById('contextChips');
  DEFAULT_CONTEXTS.forEach(ctx => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oh-chip';
    btn.textContent = ctx;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const pressed = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!pressed));
    });
    wrap.appendChild(btn);
  });
}

async function loadRules() {
  const res = await fetch('./data/rules.json', { cache: 'no-store' });
  RULES = await res.json();
}

function getSelectedContexts() {
  return [...document.querySelectorAll('.oh-chip[aria-pressed="true"]')].map(b => b.textContent.toLowerCase());
}

function scoreRule(rule, indication, region, contexts) {
  let score = 0;

  // Keywords
  const text = indication.toLowerCase();
  const hits = (rule.keywords || []).filter(k => text.includes(k.toLowerCase()));
  score += hits.length * 5;

  // Context overlap
  const ctxOverlap = (rule.contexts || []).filter(c => contexts.includes(c.toLowerCase())).length;
  score += ctxOverlap * 3;

  // Region preference (if user selected one)
  if (region && rule.region.toLowerCase() === region.toLowerCase()) score += 4;

  // Fallback bonus for oncology general if cancer words present
  if (/cancer|carcinoma|lymphoma|sarcoma|melanoma|tumor|malign/.test(text) && rule.tags?.includes('oncology-general')) {
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
  // If no good match, default to oncology-general SBTMT
  if (!best || best.score < 3) {
    const def = RULES.find(r => r.tags?.includes('oncology-general'));
    return { rule: def, hits: [] };
  }
  return best;
}

function fillTemplate(tpl, { context, condition }) {
  return tpl
    .replaceAll('{context}', context || 'staging')
    .replaceAll('{condition}', condition || 'suspected malignancy');
}

function deriveConditionFromHits(hits) {
  if (!hits || !hits.length) return 'the stated condition';
  // prefer first two words combined if possible
  return hits[0];
}

function renderResult(match, userRegion, contexts, indication) {
  const rule = match.rule || {};
  // Decide region/header if user left blank
  const chosenRegion = userRegion || rule.region || 'Skull base to mid-thigh';
  const header = rule.header || `PET/CT ${chosenRegion}`;

  // Choose context string
  const ctx = contexts[0] || (rule.contexts && rule.contexts[0]) || 'staging';
  const condition = deriveConditionFromHits(match.hits) || 'the stated condition';

  const reasonTpl = (rule.reasons && rule.reasons[0]) ||
    'FDG PET/CT for {context} of {condition}; evaluate extent of disease and FDG-avid metastases.';
  const reason = fillTemplate(reasonTpl, { context: ctx, condition });

  // DOM
  document.getElementById('outHeader').textContent = header;
  const reasonBox = document.getElementById('outReason');
  reasonBox.value = reason;

  // Lists
  const ulPrep = document.getElementById('outPrep');
  const ulDocs = document.getElementById('outDocs');
  const ulFlags = document.getElementById('outFlags');
  [ulPrep, ulDocs, ulFlags].forEach(ul => ul.innerHTML = '');

  (rule.prep_notes || []).forEach(x => {
    const li = document.createElement('li'); li.textContent = x; ulPrep.appendChild(li);
  });
  (rule.supporting_docs || []).forEach(x => {
    const li = document.createElement('li'); li.textContent = x; ulDocs.appendChild(li);
  });
  (rule.flags || []).forEach(x => {
    const li = document.createElement('li'); li.textContent = x; ulFlags.appendChild(li);
  });

  document.getElementById('results').hidden = false;
}

function copy(text) {
  navigator.clipboard.writeText(text).catch(()=>{});
}

function wireEvents() {
  document.getElementById('suggestBtn').addEventListener('click', () => {
    const indication = document.getElementById('indication').value.trim();
    const region = document.getElementById('region').value.trim();
    const contexts = getSelectedContexts();

    const match = pickBestRule(indication, region, contexts);
    renderResult(match, region, contexts, indication);
  });

  document.getElementById('copyReasonBtn').addEventListener('click', () => {
    copy(document.getElementById('outReason').value);
  });

  document.getElementById('copyAllBtn').addEventListener('click', () => {
    const header = document.getElementById('outHeader').textContent;
    const reason = document.getElementById('outReason').value;

    const listToText = (ulId) => [...document.querySelectorAll(`#${ulId} li`)].map(li => `• ${li.textContent}`).join('\n');

    const prep = listToText('outPrep');
    const docs = listToText('outDocs');
    const flags = listToText('outFlags');

    const bundle = `Study Header:\n${header}\n\nReason for Exam:\n${reason}\n\nPrep / Contraindications:\n${prep}\n\nSupporting Docs:\n${docs}\n\nClinical Flags:\n${flags}\n`;
    copy(bundle);
  });

  document.getElementById('printBtn').addEventListener('click', () => window.print());
}

document.addEventListener('DOMContentLoaded', async () => {
  initChips();
  await loadRules();
  wireEvents();
});
