// order-helper/admin/admin.js  (rev3 — Firestore-only, published_rules)
// ------------------------------------------------------
// - Uses Firebase v9 modular SDK (CDN imports)
// - Reads config from window.ORADIGIT_FIREBASE_CONFIG
// - Status beacon colors: yellow=working, green=ok, red=error
// - Load Rules and Save All now use /published_rules/{modality}/records
// ------------------------------------------------------

const beacon = document.getElementById('firebase-status');
const setBeacon = (bg, brd, col, msg) => { if (beacon) { beacon.style.background = bg; beacon.style.border = brd; beacon.style.color = col; beacon.textContent = msg; } };
const ok   = (m) => setBeacon('#e6ffed', '1px solid #34c759', '#1b5e20', m);
const warn = (m) => setBeacon('#fff3cd', '1px solid #ffec99', '#8a6d3b', m);
const err  = (m) => setBeacon('#ffecec', '1px solid #ff3b30', '#7f1d1d', m);

// UI handles
const authBox = document.getElementById('authBox');
const appBox  = document.getElementById('appBox');
const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const authMsg = document.getElementById('authMsg');
const moduleEl = document.getElementById('module');
const rulesTableBody = document.querySelector('#rulesTable tbody');
const saveMsg = document.getElementById('saveMsg');

// Utility: normalize CSV text fields
const splitCSV = (v) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];

// Convert a <tr> back into a rule object
function rowToRule(tr){
  const q = (sel) => tr.querySelector(sel)?.value.trim() ?? '';
  return {
    modality: q('.modality'),
    region: q('.region'),
    contexts: splitCSV(q('.contexts')),
    keywords: splitCSV(q('.keywords')),
    header: q('.header'),
    reasons: [ q('.reason') ],
    prep_notes: splitCSV(q('.prep')),
    supporting_docs: splitCSV(q('.docs')),
    flags: splitCSV(q('.flags')),
    tags: splitCSV(q('.tags')),
  };
}
 // ---------- Helpers for publishing a structured spec ----------

// unique, trimmed, sorted
function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean).map(s => String(s).trim())))
              .sort((a, b) => a.localeCompare(b));
}

// PET/CT → PET_CT  (folder-safe, normalized)
function canonicalizeModalityId(v) {
  return (v || 'PET_CT').replace(/[\/\s-]+/g, '_').replace(/_{2,}/g, '_').toUpperCase();
}

// Build a structured spec from the flat rows (used by public app dropdowns)
function aggregateForModality(rows, meta = {}) {
  const regions    = uniq(rows.map(r => r.region));
  const contexts   = uniq(rows.flatMap(r => r.contexts || []));
  // If you add a dedicated "conditions" column later, swap to r.conditions. For now we derive from keywords.
  const conditions = uniq(rows.flatMap(r => r.conditions || r.keywords || []));
  const headers    = uniq(rows.map(r => r.header));
  const reasons    = uniq(rows.flatMap(r => r.reasons || []));  // we reuse as indication templates

  // Optional extras if you begin storing on rows; kept for future-proofing:
  const contrast_options = uniq(rows.flatMap(r => r.contrast_options || []));
  const laterality       = uniq(rows.flatMap(r => r.laterality || []));
  const body_parts       = uniq(rows.flatMap(r => r.body_parts || []));

  // CPT roll-up (minimal map from row data if present)
  const common_cpt = uniq(rows.flatMap(r => r.cpt || []));
  const cpt_map = {};
  rows.forEach(r => {
    if (r.cpt && r.cpt.length) {
      const contrast = r.contrast || r.contrast_text || 'None';
      const key = `${r.region || ''} | ${r.header || ''} | ${contrast}`;
      cpt_map[key] = uniq(r.cpt);
    }
  });

  const now = Date.now();
  return {
    schema_version: '2.0',
    regions,
    body_parts,
    contrast_options,
    laterality,
    contexts,
    conditions,
    icd10: uniq(rows.flatMap(r => r.icd10 || [])),
    common_cpt,
    cpt_map,
    indication_templates: reasons,   // public app uses these to seed the Clinical Indication dropdown
    headers,
    updatedAt: now,
    updatedBy: (window.__OH_ADMIN?.auth?.currentUser?.email) || null,
    ...meta
  };
}

// Render a row into the table
function addRuleRow(rule = {}){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="modality" value="${rule.modality || ''}"></td>
    <td><input class="region" value="${rule.region || ''}"></td>
    <td><input class="contexts" value="${(rule.contexts||[]).join(', ')}"></td>
    <td><input class="keywords" value="${(rule.keywords||[]).join(', ')}"></td>
    <td><input class="header" value="${rule.header || ''}"></td>
    <td><textarea class="reason">${(rule.reasons?.[0]) || ''}</textarea></td>
    <td><input class="prep" value="${(rule.prep_notes||[]).join(', ')}"></td>
    <td><input class="docs" value="${(rule.supporting_docs||[]).join(', ')}"></td>
    <td><input class="flags" value="${(rule.flags||[]).join(', ')}"></td>
    <td><input class="tags" value="${(rule.tags||[]).join(', ')}"></td>
    <td><button class="del btn btn-outline" title="Delete row">X</button></td>
  `;
  tr.querySelector('.del').onclick = () => tr.remove();
  rulesTableBody.appendChild(tr);
}

(async () => {
  try {
    // 1) Ensure config is present
    const cfg = window.ORADIGIT_FIREBASE_CONFIG || window.FIREBASE_CONFIG;
    if (!cfg) throw new Error('Firebase config not found.');
    warn('Firebase: loading SDK…');

    // 2) Import Firebase modular SDK (v9)
    const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }, { getFirestore, collection, getDocs, writeBatch, doc }] =
      await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js')
      ]);

    // 3) Initialize app + services
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    const auth = getAuth(app);
    const db = getFirestore(app);
    window.__OH_ADMIN = { app, auth, db };

    ok('Firebase initialized. Checking auth state…');

    // 4) Auth state → toggle UI
    onAuthStateChanged(auth, (user) => {
      if (user) {
        ok(`Signed in as ${user.email || user.uid}`);
        authBox.hidden = true;
        appBox.hidden = false;
      } else {
        warn('Initialized (not signed in).');
        authBox.hidden = false;
        appBox.hidden = true;
      }
    });

    // 5) Wire Sign In / Out
    document.getElementById('signInBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value.trim());
        ok('Signed in.');
      } catch (e) {
        console.error(e);
        authMsg.textContent = e.message;
        err('Sign-in failed: ' + e.message);
      }
    });

    document.getElementById('signOutBtn')?.addEventListener('click', async () => {
      try {
        await signOut(auth);
        warn('Signed out.');
      } catch (e) {
        console.error(e);
        err('Sign-out failed: ' + e.message);
      }
    });

    // 6) LOAD RULES — from /published_rules/{modality}/records
    async function loadRules() {
      rulesTableBody.innerHTML = '';
      saveMsg.textContent = 'Loading…';
      const modality = moduleEl?.value || 'PET_CT';
      const snap = await getDocs(collection(db, 'published_rules', modality, 'records'));
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

      if (rows.length > 0) {
        rows.forEach(addRuleRow);
        saveMsg.textContent = `Loaded ${rows.length} rule(s) from Firestore (${modality}).`;
        ok(`Rules loaded: ${rows.length}`);
      } else {
        saveMsg.textContent = 'No rules found in Firestore.';
        warn('No rules found.');
      }
    }

    // 7)// 7) SAVE ALL — wipe & rewrite /published_rules/{MOD}/records + write /spec
async function saveAll() {
  const modalityRaw = moduleEl?.value || 'PET_CT';
  const MOD = canonicalizeModalityId(modalityRaw);  // e.g., PET_CT, CT, MRI
  saveMsg.textContent = `Saving ${MOD}…`;
  try {
    // Collect rows from the table and lightly validate
    const trs   = Array.from(rulesTableBody.querySelectorAll('tr'));
    const toAdd = trs.map(rowToRule)
      .filter(r => (r.region || r.header || (r.reasons && r.reasons[0]))); // keep non-empty rows

    if (toAdd.length === 0) {
      saveMsg.textContent = 'Nothing to save — add at least one row.';
      warn('Save aborted: zero rows.');
      return;
    }

    // 1) Delete existing docs under /published_rules/{MOD}/records
    const snap = await getDocs(collection(db, 'published_rules', MOD, 'records'));
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));

    // 2) Write new flat records
    toAdd.forEach(obj => {
      const ref = doc(collection(db, 'published_rules', MOD, 'records')); // auto-id
      batch.set(ref, obj);
    });

    // 3) Write aggregated spec (+ meta)
    const spec = aggregateForModality(toAdd);

// Must use even segments: published_rules/{MOD}/spec/spec
const specRef = doc(db, 'published_rules', MOD, 'spec', 'spec');
batch.set(specRef, spec);
    // Write meta into a single doc inside the meta collection
const metaRef = doc(db, 'published_rules', MOD, 'meta', 'meta');
batch.set(metaRef, {
  modality: MOD,
  recordCount: toAdd.length,
  updatedAt: spec.updatedAt,
  updatedBy: spec.updatedBy
});


    // Commit all changes
    await batch.commit();

    ok(`Saved ${toAdd.length} rule(s) + spec for ${MOD}.`);
    saveMsg.textContent = `Saved ${toAdd.length} rule(s) + spec for ${MOD}.`;
  } catch (e) {
    console.error(e);
    err('Save failed: ' + e.message);
    saveMsg.textContent = 'Save failed: ' + e.message;
    alert('Save failed: ' + e.message);
  }
}

    // 8) Wire buttons
    document.getElementById('loadBtn')?.addEventListener('click', loadRules);
    document.getElementById('newRuleBtn')?.addEventListener('click', () => addRuleRow({ modality: '', region: '' }));
    document.getElementById('saveAllBtn')?.addEventListener('click', saveAll);

  } catch (e) {
    console.error(e);
    err('Admin init error: ' + e.message);
    if (authMsg) authMsg.textContent = 'Error: ' + e.message;
  }
})();
