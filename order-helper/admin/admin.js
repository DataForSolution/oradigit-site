(async () => {
  try {
    // Wait for FIREBASE_CONFIG from index.html loader
    if (!window.FIREBASE_CONFIG) {
      throw new Error("Firebase config not found. Check index.html loader.");
    }

    // Init
    const app = firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // UI
    const authBox = document.getElementById('authBox');
    const appBox  = document.getElementById('appBox');
    const emailEl = document.getElementById('email');
    const passEl  = document.getElementById('password');
    const authMsg = document.getElementById('authMsg');
    const rulesTableBody = document.querySelector('#rulesTable tbody');
    const moduleEl = document.getElementById('module');
    const saveMsg = document.getElementById('saveMsg');

    document.getElementById('signInBtn').onclick = async () => {
      authMsg.textContent = '';
      try {
        await auth.signInWithEmailAndPassword(emailEl.value.trim(), passEl.value.trim());
      } catch (e) { authMsg.textContent = e.message; }
    };

    document.getElementById('signOutBtn').onclick = () => auth.signOut();

    auth.onAuthStateChanged(user => {
      if (user) { authBox.hidden = true; appBox.hidden = false; }
      else { authBox.hidden = false; appBox.hidden = true; }
    });

    // Helpers
    function rowToRule(tr){
      const q = sel => tr.querySelector(sel).value.trim();
      const split = v => v ? v.split(',').map(s=>s.trim()).filter(Boolean) : [];
      return {
        modality: q('.modality'),
        region: q('.region'),
        contexts: split(q('.contexts')),
        keywords: split(q('.keywords')),
        header: q('.header'),
        reasons: [q('.reason')],
        prep_notes: split(q('.prep')),
        supporting_docs: split(q('.docs')),
        flags: split(q('.flags')),
        tags: split(q('.tags'))
      };
    }

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
        <td><button class="del btn btn-outline">X</button></td>
      `;
      tr.querySelector('.del').onclick = () => tr.remove();
      rulesTableBody.appendChild(tr);
    }

    async function loadRules(){
      rulesTableBody.innerHTML = '';
      saveMsg.textContent = 'Loading...';
      const snap = await db.collection(moduleEl.value).get();
      const data = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      data.forEach(r => addRuleRow(r));
      saveMsg.textContent = `Loaded ${data.length} rule(s).`;
    }

    async function saveAll(){
      saveMsg.textContent = 'Saving...';
      // wipe & re-add (simplest for MVP)
      const batch = db.batch();
      const col = db.collection(moduleEl.value);
      const existing = await col.get();
      existing.forEach(d => batch.delete(d.ref));
      await batch.commit();

      // add new
      const trs = [...rulesTableBody.querySelectorAll('tr')];
      const toAdd = trs.map(tr => rowToRule(tr));
      const batch2 = db.batch();
      toAdd.forEach(obj => {
        const ref = col.doc(); // auto-id
        batch2.set(ref, obj);
      });
      await batch2.commit();
      saveMsg.textContent = `Saved ${toAdd.length} rule(s).`;
    }

    // Wire buttons
    document.getElementById('loadBtn').onclick = loadRules;
    document.getElementById('newRuleBtn').onclick = () => addRuleRow({ modality:"", region:"" });
    document.getElementById('saveAllBtn').onclick = saveAll;

  } catch (err) {
    console.error("Admin init error:", err);
    const authMsg = document.getElementById('authMsg') || document.body;
    authMsg.textContent = 'Error: ' + err.message;
  }
})();
