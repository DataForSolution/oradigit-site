// order-helper/admin/firebase-config.js
// ------------------------------------------------------
// Firebase client configuration for OraDigit Order Helper (Admin)
// Must load BEFORE admin.js. Do NOT import or initialize Firebase here.
// admin.js will import the v9 SDK and initialize using this object.
// ------------------------------------------------------

window.ORADIGIT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD0M25FYmIC81wAXuYjPegplXf_FRn6XS0",
  authDomain: "oradigit-ce343.firebaseapp.com",
  projectId: "oradigit-ce343",
  storageBucket: "oradigit-ce343.appspot.com",     // <- fixed
  messagingSenderId: "425004783450",
  appId: "1:425004783450:web:d419fadeb4dca4c9f64563",
  measurementId: "G-0SSD2NTG2Y"                    // optional; OK to keep
};

// Legacy alias (if any old code reads FIREBASE_CONFIG)
window.FIREBASE_CONFIG = window.ORADIGIT_FIREBASE_CONFIG;

// Debug beacon so we can verify it loaded
console.log("✅ Firebase config injected:", window.ORADIGIT_FIREBASE_CONFIG);
