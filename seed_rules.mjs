/**
 * OraDigit Firestore Seeder (Full Version)
 * Seeds all modalities under /published_rules for the Order Helper app.
 * Run: node seed_rules.mjs
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";

// --- Load your Firebase Admin Key ---
const serviceAccount = JSON.parse(
  readFileSync("C:/Users/llibe/OneDrive/Documents/Outlook Files/oradigit-ce343-firebase-adminsdk-fbsvc-5d6041a4ea.json", "utf8")
);

// --- Initialize Firebase Admin SDK ---
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "oradigit-ce343",
});

const db = admin.firestore();

// --- Define data for each modality ---
const data = {
  CT: {
    regions: ["Head/Brain", "Chest", "Abdomen/Pelvis", "CTA", "Sinuses"],
    contexts: ["Acute", "Follow-up", "Oncology staging", "Trauma", "Screening"],
    conditions: ["Stroke/TIA", "Pulmonary embolism", "Appendicitis", "Renal colic"],
    indication_templates: [
      "Evaluate for pulmonary embolism.",
      "Assess suspected appendicitis.",
      "Follow-up known lung nodule.",
    ],
    reason_templates: [
      "Rule out acute pathology.",
      "Restaging known malignancy.",
      "Evaluate infection or inflammation.",
    ],
    headers: ["Non-contrast head", "CTA chest", "Abdomen/Pelvis with IV contrast"],
    keywords: ["stroke", "PE", "appendicitis", "renal colic", "trauma"],
    prep: ["NPO 4 hours if IV contrast", "Confirm IV access"],
    docs: ["ACR Appropriateness Criteria", "CT Protocol Handbook"],
    flags: ["Contrast allergy", "Renal insufficiency", "Pregnancy precautions"],
    tags: ["Emergency", "Oncology", "Screening"],
  },
  MRI: {
    regions: ["Brain", "Spine", "Abdomen", "Pelvis", "MSK"],
    contexts: ["Acute", "Follow-up", "Staging", "Surveillance"],
    conditions: ["MS", "Seizure", "Radiculopathy"],
    indication_templates: ["Evaluate demyelinating disease.", "Seizure evaluation."],
    reason_templates: ["Characterize findings from prior imaging."],
    headers: ["Brain MRI", "Spine MRI"],
    keywords: ["tumor", "seizure", "MS", "spine"],
    prep: ["MRI safety screening", "Check implants"],
    docs: ["MRI Safety Guidelines"],
    flags: ["Pacemaker/CIED", "Renal function for GBCA"],
    tags: ["Neuro", "MSK"],
  },
  PET_CT: {
    regions: ["Skull base to mid-thigh", "Whole body"],
    contexts: ["Staging", "Restaging", "Treatment response"],
    conditions: ["NSCLC", "Lymphoma", "Colorectal cancer"],
    indication_templates: ["Initial staging of biopsy-proven malignancy."],
    reason_templates: ["Evaluate treatment response."],
    headers: ["FDG PET/CT"],
    keywords: ["oncology", "recurrence", "staging"],
    prep: ["NPO 6 hours", "Blood glucose <200 mg/dL"],
    docs: ["SNMMI Guidelines"],
    flags: ["Diabetes mgmt for FDG", "Pregnancy precautions"],
    tags: ["Oncology", "Infection"],
  },
  X_Ray: {
    regions: ["Chest", "Abdomen", "Extremity", "Spine"],
    contexts: ["Acute", "Follow-up", "Screening"],
    conditions: ["Pneumonia", "Fracture", "Foreign body"],
    indication_templates: ["Rule out pneumonia.", "Evaluate for fracture."],
    reason_templates: ["Assess for acute pathology."],
    headers: ["Chest X-ray PA/Lateral", "Abdominal X-ray"],
    keywords: ["pneumonia", "fracture", "abdomen"],
    prep: ["Remove metal objects"],
    docs: ["X-Ray Safety Guidelines"],
    flags: ["Pregnancy precautions"],
    tags: ["General", "Emergency"],
  },
  Ultrasound: {
    regions: ["Abdomen", "Pelvis", "Neck", "Extremity"],
    contexts: ["Screening", "Follow-up", "Acute"],
    conditions: ["Gallstones", "Thyroid nodule", "DVT"],
    indication_templates: ["Evaluate for gallstones.", "Assess DVT."],
    reason_templates: ["Evaluate soft tissue abnormality."],
    headers: ["Abdominal US", "Pelvic US"],
    keywords: ["gallbladder", "thyroid", "DVT"],
    prep: ["NPO 8 hours for abdominal scan"],
    docs: ["Ultrasound Protocol Handbook"],
    flags: ["Obesity limiting visualization"],
    tags: ["General", "Screening"],
  },
  Mammography: {
    regions: ["Breast", "Axilla"],
    contexts: ["Screening", "Diagnostic", "Follow-up"],
    conditions: ["Breast mass", "Pain", "Abnormal screening mammogram"],
    indication_templates: ["Screening mammogram.", "Evaluate abnormal mammogram."],
    reason_templates: ["Routine breast cancer screening.", "Diagnostic evaluation of breast symptoms."],
    headers: ["Screening mammogram", "Diagnostic mammogram"],
    keywords: ["breast", "screening", "calcifications", "mass"],
    prep: ["Avoid deodorant or powder before scan"],
    docs: ["ACR BI-RADS Guidelines"],
    flags: ["Pregnancy precautions"],
    tags: ["Women's Health", "Oncology"],
  },
  Nuclear_Medicine: {
    regions: ["Whole body", "Thyroid", "Renal", "Bone"],
    contexts: ["Staging", "Evaluation", "Follow-up"],
    conditions: ["Thyroid cancer", "Renal function", "Bone metastases"],
    indication_templates: ["Evaluate metastatic disease.", "Assess renal function."],
    reason_templates: ["Functional imaging for evaluation of organ-specific pathology."],
    headers: ["Whole-body bone scan", "Thyroid uptake scan"],
    keywords: ["bone", "thyroid", "renal", "metastatic"],
    prep: ["Hydrate well before and after scan", "Stop thyroid meds if required"],
    docs: ["SNMMI Procedure Guidelines"],
    flags: ["Radiation safety", "Pregnancy precautions"],
    tags: ["Oncology", "Functional Imaging"],
  },
};

// --- Seed Firestore ---
(async () => {
  for (const [mod, payload] of Object.entries(data)) {
    await db.collection("published_rules").doc(mod).set(payload, { merge: true });
    console.log(`✅ ${mod} seeded`);
  }
  console.log("🎉 All modalities written successfully!");
})();
