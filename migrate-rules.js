/**
 * migrate-rules.js
 * Fixed version — handles modality names with "/" or "-"
 */

const fs = require("fs");
const admin = require("firebase-admin");

// 🔑 Load your service account key
const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Simple sanitizer for Firestore IDs
function sanitizeId(str) {
  return str.replace(/[\/\s-]/g, "_"); // replace "/", " ", "-" with "_"
}

async function migrate() {
  try {
    const raw = fs.readFileSync("./order-helper/data/rules.json", "utf8");
    const rules = JSON.parse(raw);

    // --- Save modalities ---
    if (rules.modalities) {
      for (const [modality, data] of Object.entries(rules.modalities)) {
        const safeId = sanitizeId(modality);
        const ref = db.collection("published_rules").doc(safeId);

        await ref.set({
          name: modality, // keep original name too
          ...data,
          updated_at: new Date().toISOString(),
        });

        console.log(`✅ Saved modality: ${modality} → ${safeId}`);
      }
    }

    // --- Save records ---
    if (rules.records) {
      for (const rec of rules.records) {
        const modality = sanitizeId(rec.modality);
        const id = sanitizeId(rec.id || db.collection("tmp").doc().id);
        const ref = db
          .collection("published_rules")
          .doc(modality)
          .collection("records")
          .doc(id);

        await ref.set({
          ...rec,
          updated_at: new Date().toISOString(),
        });

        console.log(`📄 Saved record: ${rec.id || "(no-id)"} under ${modality}`);
      }
    }

    console.log("\n🎉 Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migrate();
