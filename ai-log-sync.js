/* Taj Medical Store — AI conversation logging */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, addDoc, setDoc, query, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { FIREBASE_CONFIG, isFirebaseConfigured, ADMIN_EMAIL_FOR_RULES } from "./firebase-config.js";

(() => {
  if (!isFirebaseConfigured()) return;
  try {
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app), auth = getAuth(app);
    let readyResolve; const ready = new Promise(r => readyResolve = r);
    onAuthStateChanged(auth, user => readyResolve(user || null));

    async function getUser() {
      const user = await ready;
      if (user) return user;
      try { const c = await signInAnonymously(auth); return c.user; } catch { return null; }
    }

    window.tmsAiLog = async function(role, text, meta = {}) {
      const user = await getUser(); if (!user || !text) return;
      const chatRef = doc(db, 'aiChats', user.uid);
      await setDoc(chatRef, {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || meta.name || 'Guest',
        lastMessage: String(text).slice(0, 180),
        lastRole: role,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await addDoc(collection(chatRef, 'messages'), { role, text: String(text).slice(0, 8000), timestamp: serverTimestamp() });
    };

    window.tmsListenAllAiChats = function(callback, onError) {
      const unsub = onSnapshot(query(collection(db, 'aiChats')), snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        rows.sort((a,b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
        callback(rows);
      }, err => onError && onError(err));
      return unsub;
    };

    window.tmsAiLogReady = true;
  } catch (e) { console.error('AI log init failed', e); }
})();
