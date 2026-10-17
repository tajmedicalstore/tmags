/*
 * Taj Medical Store — Website & Admin System
 * Made By Farhan (Farhan Ali) — All Rights Reserved.
 * Contact: tajmedicalstoreofficial@gmail.com
 */

/* =========================================================
   FIREBASE PROJECT CONFIG — paste your config from the
   Firebase console here ONCE. Both firebase-sync.js (site
   content/live sync) and chat-sync.js (customer messages)
   import it from this one file.
   ========================================================= */
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAgbG_7FUCN8HvKGdRrdSdxy_iJuz-y3No",
    authDomain: "taj-medical-store-9a3ad.firebaseapp.com",
    projectId: "taj-medical-store-9a3ad",
    storageBucket: "taj-medical-store-9a3ad.firebasestorage.app",
    messagingSenderId: "967567684282",
    appId: "1:967567684282:web:c83ea8b96d943ff9550883",
    measurementId: "G-EWPP2YM9L8"
};

export const ADMIN_EMAIL_FOR_RULES = 'farhanalipervez@gmail.com';

export function isFirebaseConfigured() {
    return FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('YOUR_');
}

// A single, reliable flag any page/module can check synchronously via
// window — set once, the first time this file is imported by any of
// firebase-sync.js / chat-sync.js / account-sync.js (whichever loads
// first), so the UI can tell "not configured yet" apart from "configured
// but something failed to start" (a real bug worth showing in console).
window.isFirebaseConfiguredGlobal = isFirebaseConfigured();
