/*
 * Taj Medical Store — Website & Admin System
 * Made By Farhan (Farhan Ali) — All Rights Reserved.
 * Contact: tajmedicalstoreofficial@gmail.com
 */

/* =========================================================
   CUSTOMER ACCOUNTS — manual sign-up (email/password) and
   Google sign-in, with a profile stored in Firestore that the
   admin can view/edit from admin.html → Accounts.

   Needs the SAME Firebase project as chat-sync.js, with
   Email/Password AND Google enabled under Authentication →
   Sign-in method (see the setup comment in firebase-sync.js).

   Role tags: every profile has a "role" — 'customer' by default.
   The one email in ADMIN_EMAIL_FOR_RULES (firebase-config.js)
   always shows as 'admin' automatically. Any other role (manager,
   owner, director, developer) is assigned by the admin from
   admin.html → Accounts, and shows next to that person's name
   once THEY sign in on the front-end.
   ========================================================= */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, doc, setDoc, getDoc, updateDoc, collection, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult,
    GoogleAuthProvider, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail,
    sendEmailVerification, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { FIREBASE_CONFIG, isFirebaseConfigured, ADMIN_EMAIL_FOR_RULES } from "./firebase-config.js";

window.accountReady = false;

if (isFirebaseConfigured()) {
    try {
        const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
        const db = getFirestore(app);
        const auth = getAuth(app);

        window.accountReady = true;
        window.tmsRoleCapabilities = {
            customer:['browse','cart','prescription','chat','reviews','orders','profile'],
            pharmacist:['browse','stock','prescription','chat','reviews','profile'],
            manager:['browse','stock','orders','customers','notifications','profile'],
            owner:['browse','stock','orders','customers','notifications','reports','profile'],
            director:['browse','stock','orders','customers','notifications','reports','profile'],
            developer:['browse','system','ai','profile'],
            admin:['all']
        };
        async function logActivity(user, action, detail='') {
            try { await setDoc(doc(collection(db,'activityLogs')), {uid:user.uid, email:user.email||'', action, detail:String(detail).slice(0,500), timestamp:serverTimestamp()}); } catch(e) { console.warn('activity log failed',e); }
        }

        async function ensureProfile(user, extra) {
            const ref = doc(db, 'users', user.uid);
            const snap = await getDoc(ref);
            if (!snap.exists()) {
                await setDoc(ref, {
                    name: (extra && extra.name) || user.displayName || 'Customer',
                    username: (extra && extra.username) || (user.email ? user.email.split('@')[0] : 'customer'),
                    phone: (extra && extra.phone) || '',
                    email: user.email || '',
                    provider: (extra && extra.provider) || 'password',
                    emailVerified: !!user.emailVerified,
                    role: user.email === ADMIN_EMAIL_FOR_RULES ? 'admin' : 'customer',
                    createdAt: serverTimestamp()
                });
            }
            const fresh = await getDoc(ref);
            const profile = fresh.data() || {};
            const patch = {};
            if (!profile.username) patch.username = user.email ? user.email.split('@')[0] : 'customer';
            if (profile.emailVerified !== !!user.emailVerified) patch.emailVerified = !!user.emailVerified;
            if (Object.keys(patch).length) { try { await updateDoc(ref, patch); } catch(e) {} }
            return { ...profile, ...patch };
        }

        window.accountSignUp = function (name, email, password, phone, extraUsername) {
            return createUserWithEmailAndPassword(auth, email, password).then(async (cred) => {
                await updateProfile(cred.user, { displayName: name });
                await ensureProfile(cred.user, { name, username: extraUsername || '', phone, provider: 'password' });
                await logActivity(cred.user,'account_created','Email/password signup');
                return cred.user;
            });
        };

        window.accountSignIn = function (email, password) {
            return signInWithEmailAndPassword(auth, email, password).then(async cred => { await logActivity(cred.user,'sign_in','Email/password'); return cred; });
        };

        async function finishGoogleSignIn(cred) {
            if (!cred || !cred.user) return null;
            await ensureProfile(cred.user, { name: cred.user.displayName, username: (cred.user.email || 'customer').split('@')[0], provider: 'google' });
            await logActivity(cred.user, 'sign_in', 'Google');
            return cred.user;
        }
        // Complete a redirect sign-in after returning from Google's consent screen.
        getRedirectResult(auth).then(finishGoogleSignIn).catch(err => {
            console.error('Google redirect sign-in failed:', err);
            window.accountGoogleRedirectError = err;
        });
        window.accountGoogleSignIn = async function () {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            try {
                return await finishGoogleSignIn(await signInWithPopup(auth, provider));
            } catch (err) {
                // Mobile browsers frequently block popups; redirect is the supported fallback.
                if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment'].includes(err.code)) {
                    await signInWithRedirect(auth, provider);
                    return null;
                }
                throw err;
            }
        };

        window.accountSignOut = function () {
            const u=auth.currentUser; return (u ? logActivity(u,'sign_out','User logout') : Promise.resolve()).finally(()=>signOut(auth));
        };

        window.accountSendPasswordReset = function (email) { return sendPasswordResetEmail(auth, email); };
        window.accountSendVerification = function () { const u=auth.currentUser; return u ? sendEmailVerification(u) : Promise.reject(new Error('No signed-in user')); };
        window.accountChangePassword = function (password) { const u=auth.currentUser; return u ? updatePassword(u, password) : Promise.reject(new Error('No signed-in user')); };
        window.accountCurrentUser = function () { return auth.currentUser; };

        // Fires with (null) when logged out, or ({uid, name, email, role, provider}) when logged in.
        window.accountListenAuthState = function (callback) {
            return onAuthStateChanged(auth, async (user) => {
                if (!user || user.isAnonymous) { callback(null); return; }
                try {
                    const profile = await ensureProfile(user, {});
                    callback({ uid: user.uid, ...profile, emailVerified: !!user.emailVerified });
                } catch (e) {
                    console.error('Could not load account profile:', e);
                    callback(null);
                }
            });
        };

        window.accountUpdateProfile = function (uid, data) {
            return updateDoc(doc(db, 'users', uid), data);
        };

        // Admin only (Firestore rules restrict this to the admin email).
        window.accountListenAllUsers = function (callback, onError) {
            return onSnapshot(collection(db, 'users'), (snap) => {
                callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
            }, (err) => {
                console.error('Accounts listen error:', err);
                if (typeof onError === 'function') onError(err);
            });
        };

        window.accountSetRole = function (uid, role) {
            return updateDoc(doc(db, 'users', uid), { role });
        };

        if (typeof window.onAccountReady === 'function') window.onAccountReady();
    } catch (e) {
        console.error('Account system init failed:', e);
        window.accountInitError = e;
    }
} else {
    console.info('Accounts not connected yet — Firebase isn\'t configured. See the FIREBASE SETUP comment in firebase-sync.js.');
}
