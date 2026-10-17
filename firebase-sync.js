/*
 * Taj Medical Store — Website & Admin System
 * Made By Farhan (Farhan Ali) — All Rights Reserved.
 * Contact: tajmedicalstoreofficial@gmail.com
 */

/* =========================================================
   FIREBASE SETUP (optional — makes admin edits go live for
   every visitor instead of just this browser/device, and
   powers the customer chat in chat-sync.js). Steps:

   1. Go to https://console.firebase.google.com → Create a
      project (free "Spark" plan is enough).
   2. Build → Firestore Database → Create database
      (start in "test mode" for now, lock down with rules below).
   3. Build → Authentication → Sign-in method → enable
      "Email/Password" AND "Anonymous" (Anonymous powers the
      customer chat — each visitor gets a private identity
      without needing to make an account) AND "Google" (for the
      "Continue with Google" sign-in button — customer accounts).
      Then Authentication → Users → Add user with EXACTLY this
      email/password so admin.html can also authenticate:
        Email:    farhanalipervez@gmail.com
        Password: TMS@786
   4. Project settings (gear icon) → General → "Your apps" →
      Web app (</>) → copy the firebaseConfig object it gives
      you and paste it into firebase-config.js (NOT this file —
      there's only one config file now, shared by this script,
      chat-sync.js, and account-sync.js).
   5. Firestore → Rules tab → publish the contents of `firestore.rules` from this repository.\n      Do not paste an older rules example from this comment.\n\n   6. Re-upload firebase-config.js to GitHub with your real
      config (same folder as index.html and admin.html). Reload
      the site — the "Sync Status" box in admin.html → Site
      Settings will confirm it's connected.

   Until you complete this, both pages keep working exactly as
   they do now (localStorage only, per device/browser) and the
   chat button won't be able to send messages.
   ========================================================= */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { FIREBASE_CONFIG, isFirebaseConfigured } from "./firebase-config.js";

window.firebaseReady = false;

if (isFirebaseConfigured()) {
    try {
        const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
        const db = getFirestore(app);
        const auth = getAuth(app);
        const siteDocRef = doc(db, 'siteData', 'main');
        const shopProductsRef = doc(db, 'tms_store', 'products');
        let latestSharedShopStock = null;

        // One shared inventory for the main catalogue and the full shop.
        // The full shop's richer product fields are preserved when the main
        // admin edits a product, and both pages use the same stable product ID.
        const shopProductToStock = (p) => ({
            id: String(p.id || ('p_' + (p.sku || p.name || Date.now()).toString().replace(/[^a-z0-9]+/gi, '_'))),
            name: String(p.name || 'Unnamed product'),
            stock: Number(p.quantity) > 0,
            quantity: Number(p.quantity) || 0,
            price: Number(p.price) || 0,
            salePrice: Number(p.discountPrice) || 0,
            desc: String(p.description || p.activeIngredient || ''),
            details: String(p.description || ''),
            category: String(p.category || 'General'),
            image: (Array.isArray(p.images) && p.images[0]) || p.image || '',
            images: Array.isArray(p.images) ? p.images : [],
            brand: p.brand || '', sku: p.sku || '', unit: p.unit || 'pcs',
            prescriptionRequired: !!p.prescriptionRequired
        });
        const stockToShopProduct = (s, old = {}) => ({
            ...old, id: String(s.id), name: String(s.name || 'Unnamed product'),
            price: Number(s.price) || 0,
            discountPrice: s.salePrice != null ? (Number(s.salePrice) > 0 ? Number(s.salePrice) : null) : (old.discountPrice || null),
            quantity: s.quantity != null ? Math.max(0, Number(s.quantity) || 0) : (s.stock ? Math.max(1, Number(old.quantity) || 1) : 0),
            category: String(s.category || old.category || 'General'),
            description: String(s.desc || s.details || old.description || ''),
            images: Array.isArray(s.images) && s.images.length ? s.images : (s.image ? [s.image] : (old.images || [])),
            unit: s.unit || old.unit || 'pcs',
            prescriptionRequired: s.prescriptionRequired != null ? !!s.prescriptionRequired : !!old.prescriptionRequired
        });

        window.firebaseReady = true;
        window.firebaseApp = app;
        window.firebaseDb = db;
        window.firebaseAuthInstance = auth;

        // Live sync: any admin save anywhere reflects here instantly,
        // on both index.html (visitors) and admin.html (other sessions).
        onSnapshot(siteDocRef, (snap) => {
            if (snap.exists() && typeof mergeSiteData === 'function') {
                window.currentSiteData = mergeSiteData(snap.data());
                if (latestSharedShopStock) window.currentSiteData.stock = latestSharedShopStock;
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('tms_site_data_v1', JSON.stringify(window.currentSiteData));
                }
                if (typeof window.onSiteDataUpdated === 'function') window.onSiteDataUpdated();
            }
        }, (err) => console.error('Firestore listen error:', err));

        // Shop -> main catalogue/admin: live mirror from the canonical shop list.
        onSnapshot(shopProductsRef, (snap) => {
            if (!snap.exists() || !Array.isArray(snap.data().list)) return;
            const sharedStock = snap.data().list.map(shopProductToStock);
            latestSharedShopStock = sharedStock;
            const current = window.currentSiteData || {};
            window.currentSiteData = { ...current, stock: sharedStock };
            try { localStorage.setItem('tms_site_data_v1', JSON.stringify(window.currentSiteData)); } catch (_) {}
            if (typeof window.onSiteDataUpdated === 'function') window.onSiteDataUpdated();
        }, (err) => console.error('Shared catalogue listener error:', err));

        // Only admin.html actually calls this (visitors never write).
        window.pushSiteDataToFirestore = async function (data) {
            try {
                await setDoc(siteDocRef, data, { merge: false });
                // Keep legacy/main-admin stock edits visible in the full shop too.
                if (Array.isArray(data.stock)) {
                    const existingSnap = await getDoc(shopProductsRef);
                    const existing = existingSnap.exists() && Array.isArray(existingSnap.data().list) ? existingSnap.data().list : [];
                    const byId = new Map(existing.map(item => [String(item.id), item]));
                    const sharedList = data.stock.map(item => stockToShopProduct(item, byId.get(String(item.id)) || {}));
                    await setDoc(shopProductsRef, { list: sharedList, updatedAt: new Date().toISOString(), updatedFrom: 'main-admin' }, { merge: true });
                }
            } catch (err) {
                console.error('Firestore save failed (are you signed in + rules published?):', err);
                throw err;
            }
        };

        window.firebaseAdminSignIn = function (email, password) {
            return signInWithEmailAndPassword(auth, email, password).catch(err => {
                console.warn('Firebase Auth sign-in failed:', err);
                throw err;
            });
        };

        window.firebaseAdminSignOut = function () {
            signOut(auth).catch(() => {});
        };

        // Cross-device security log — visible in admin.html → Security even
        // if the login happened on a different phone/laptop. Only successful
        // logins are logged here (an unauthenticated failed attempt has no
        // session to write with — those stay in that device's local log).
        window.logSecurityEvent = function (eventType) {
            if (!auth.currentUser) return;
            addDoc(collection(db, 'securityLog'), {
                type: eventType,
                timestamp: serverTimestamp(),
                userAgent: navigator.userAgent
            }).catch((err) => console.warn('Security log write failed:', err));
        };

        window.listenSecurityLog = function (callback) {
            const q = query(collection(db, 'securityLog'), orderBy('timestamp', 'desc'), limit(30));
            return onSnapshot(q, (snap) => {
                callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, (err) => console.warn('Security log read failed:', err));
        };

        if (typeof window.onFirebaseReady === 'function') window.onFirebaseReady();
    } catch (e) {
        console.error('Firebase init failed:', e);
        window.firebaseInitError = e;
    }
} else {
    console.info('Firebase not configured yet — running in local-only mode. See the FIREBASE SETUP comment at the top of this file for steps.');
}
