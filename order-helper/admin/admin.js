// order-helper/admin/admin.js  (ES Module)
// ------------------------------------------------------
// - Uses Firebase v9 modular SDK (CDN imports)
// - Reads config from window.ORADIGIT_FIREBASE_CONFIG (set by firebase-config.js or hosted JSON/JS)
// - Status beacon colors:
//    yellow = working, green = ok, red = error
// - Load Rules tries Firestore first, then falls back to local /order-helper/data/rules.json
// - Save All wipes and re-writes selected collection (MVP behavior)
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

// Utility: normalize array-ish text fields
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

// Attempt to normalize a **local** rules.json into the row shape
function normalizeLocalRules(json){
  // Case A: already a flat array in json.records
  if (Array.isArray(json?.records)) {
    return json.records;
  }
  // Case B: new schema organized by modalities -> regions (best-effort flatten)
  if (json?.modalities && typeof json.modalities === 'object') {
    const out = [];
    for (const [modality, modObj] of Object.entries(json.modalities)) {
      const regions = modObj?.regions || [];
      for (const region of regions) {
        out.push({
          modality,
          region,
          contexts: modObj?.contexts || [],
          keywords: [],
          header: modObj?.default_header || '',
          reasons: [modObj?.reason_template || ''],
          prep_notes: modObj?.prep_notes || [],
          supporting_docs: modObj?.supporting_docs || [],
          flags: modObj?.flags || [],
          tags: modObj?.tags || []
        });
      }
    }
    return out;
  }
  // Unknown shape: return empty and let UI show message
  return [];
}

(async () => {
  try {
    // 1) Ensure config is present
    const cfg = window.ORADIGIT_FIREBASE_CONFIG || window.FIREBASE_CONFIG;
    if (!cfg) throw new Error('Firebase config not found (window.ORADIGIT_FIREBASE_CONFIG). Check index.html loader and firebase-config.js.');
    warn('Firebase: loading SDK…');

    // 2) Import Firebase modular SDK (v9) from CDN
    const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }, { getFirestore, collection, getDocs, writeBatch, doc, getDoc }] =
      await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js')
      ]);

    // 3) Initialize app + services (avoid double init)
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Expose for quick debugging if needed
    window.__OH = { app, auth, db };

    ok('Firebase: SDK initialized. Checking auth state…');

    // 4) Auth state -> toggle UI
    onAuthStateChanged(auth, (user) => {
      if (user) {
        ok(`Firebase: signed in as ${user.email || user.uid}`);
        if (authBox) authBox.hidden = true;
        if (appBox) appBox.hidden = false;
      } else {
        warn('Firebase: initialized (not signed in).');
        if (authBox) authBox.hidden = false;
        if (appBox) appBox.hidden = true;
      }
    });

    // 5) Wire Sign In / Out
    const signInBtn = document.getElementById('signInBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    if (signInBtn) {
  signInBtn.onclick = async (e) => {
    e.preventDefault(); // Prevent form submission that might interrupt the request
    authMsg.textContent = '';
    try {
      const email = (emailEl?.value || '').trim();
      const pass  = (passEl?.value || '').trim();
      if (!email || !pass) throw new Error('Enter email and password.');
      await signInWithEmailAndPassword(auth, email, pass);
      ok('Signed in.');
    } catch (e) {
      console.error(e);
      authMsg.textContent = e.message;
      err('Sign-in failed: ' + e.message);
    }
  };
}

   
    if (signOutBtn) {
      signOutBtn.onclick = async () => {
        try {
          await signOut(auth);
          warn('Signed out.');
        } catch (e) {
          console.error(e);
          err('Sign-out failed: ' + e.message);
        }
      };
    }

    // 6) LOAD RULES — Firestore first, then local fallback
    async function loadRules() {
      rulesTableBody.innerHTML = '';
      saveMsg.textContent = 'Loading…';
      const colName = moduleEl?.value || 'rules_petct';

      try {
        // Firestore read
        const snap = await getDocs(collection(db, colName));
        const rows = [];
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

        if (rows.length > 0) {
          rows.forEach(addRuleRow);
          saveMsg.textContent = `Loaded ${rows.length} rule(s) from Firestore (${colName}).`;
          ok(`Rules loaded from Firestore: ${rows.length}`);
          return;
        }

        // If empty, fall back to local JSON
        warn('No Firestore rules found — trying local rules.json…');
        const cacheBust = `v=${Date.now()}`;
        const res = await fetch(`/order-helper/data/rules.json?${cacheBust}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Local rules.json fetch failed (${res.status})`);
        const json = await res.json();
        const localRows = normalizeLocalRules(json);
        if (localRows.length === 0) {
          saveMsg.textContent = 'Local rules.json loaded but no recognizable records.';
          warn('Local rules.json has no recognizable records.');
          return;
        }
        localRows.forEach(addRuleRow);
        saveMsg.textContent = `Loaded ${localRows.length} rule(s) from local rules.json.`;
        ok(`Rules loaded from local JSON: ${localRows.length}`);

      } catch (e) {
        console.error(e);
        saveMsg.textContent = 'Load failed: ' + e.message;
        err('Load Rules failed: ' + e.message);
        alert('Load Rules failed: ' + e.message);
      }
    }

    // 7) SAVE ALL — wipe & write selected collection (MVP)
    async function saveAll() {
      const colName = moduleEl?.value || 'rules_petct';
      try {
        saveMsg.textContent = 'Saving…';
        // Delete existing
        const snap = await getDocs(collection(db, colName));
        const delBatch = writeBatch(db);
        snap.forEach(d => delBatch.delete(d.ref));
        await delBatch.commit();

        // Collect rows
        const trs = Array.from(rulesTableBody.querySelectorAll('tr'));
        const toAdd = trs.map(rowToRule);

        // Write new
        const addBatch = writeBatch(db);
        toAdd.forEach(obj => {
          const ref = doc(collection(db, colName)); // auto-id
          addBatch.set(ref, obj);
        });
        await addBatch.commit();

        saveMsg.textContent = `Saved ${toAdd.length} rule(s) to ${colName}.`;
        ok(`Saved ${toAdd.length} rules.`);
      } catch (e) {
        console.error(e);
        saveMsg.textContent = 'Save failed: ' + e.message;
        err('Save failed: ' + e.message);
        alert('Save failed: ' + e.message);
      }
    }

    // 8) Wire buttons
    const loadBtn = document.getElementById('loadBtn') || document.querySelector('[data-action="load-rules"]');
    const newRuleBtn = document.getElementById('newRuleBtn');
    const saveAllBtn = document.getElementById('saveAllBtn');

    if (loadBtn) loadBtn.addEventListener('click', loadRules);
    if (newRuleBtn) newRuleBtn.addEventListener('click', () => addRuleRow({ modality: '', region: '' }));
    if (saveAllBtn) saveAllBtn.addEventListener('click', saveAll);

  } catch (e) {
    console.error(e);
    err('Admin init error: ' + e.message);
    if (authMsg) authMsg.textContent = 'Error: ' + e.message;
  }
})();
