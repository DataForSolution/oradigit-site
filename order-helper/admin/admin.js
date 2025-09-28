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

    // 7) SAVE ALL — wipe & rewrite /published_rules/{modality}/records
    async function saveAll() {
      const modality = moduleEl?.value || 'PET_CT';
      saveMsg.textContent = 'Saving…';

      // Delete existing
      const snap = await getDocs(collection(db, 'published_rules', modality, 'records'));
      const delBatch = writeBatch(db);
      snap.forEach(d => delBatch.delete(d.ref));
      await delBatch.commit();

      // Collect rows
      const trs = Array.from(rulesTableBody.querySelectorAll('tr'));
      const toAdd = trs.map(rowToRule);

      // Write new
      const addBatch = writeBatch(db);
      toAdd.forEach(obj => {
        const ref = doc(collection(db, 'published_rules', modality, 'records'));
        addBatch.set(ref, obj);
      });
      await addBatch.commit();

      saveMsg.textContent = `Saved ${toAdd.length} rule(s) to ${modality}.`;
      ok(`Saved ${toAdd.length} rules.`);
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
