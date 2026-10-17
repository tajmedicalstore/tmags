/*
 * Taj Medical Store — moderated customer reviews.
 * Uses the same Firebase project as the rest of the site.
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { FIREBASE_CONFIG, isFirebaseConfigured, ADMIN_EMAIL_FOR_RULES } from "./firebase-config.js";

window.reviewsReady = false;

if (isFirebaseConfigured()) {
    try {
        const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
        const db = getFirestore(app);
        const auth = getAuth(app);
        const reviewsRef = collection(db, 'reviews');

        window.reviewsReady = true;

        async function ensureReviewAuth() {
            if (auth.currentUser) return auth.currentUser;
            const cred = await signInAnonymously(auth);
            return cred.user;
        }

        window.reviewSubmit = async function (name, rating, text) {
            const user = await ensureReviewAuth();
            const cleanName = String(name || 'Guest User').trim().slice(0, 80);
            const cleanText = String(text || '').trim().slice(0, 2000);
            const cleanRating = Number(rating);
            if (!cleanText || !Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) {
                throw new Error('Invalid review');
            }
            return addDoc(reviewsRef, {
                uid: user.uid,
                name: cleanName || 'Guest User',
                rating: cleanRating,
                text: cleanText,
                status: 'pending',
                createdAt: serverTimestamp()
            });
        };

        window.reviewListenApproved = function (callback, onError) {
            const q = query(reviewsRef, where('status', '==', 'approved'));
            return onSnapshot(q, (snap) => {
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                rows.sort((a, b) => {
                    const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
                    const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
                    return tb - ta;
                });
                callback(rows);
            }, onError);
        };

        window.reviewListenAllAdmin = function (callback, onError) {
            if (!auth.currentUser || auth.currentUser.email !== ADMIN_EMAIL_FOR_RULES) {
                if (typeof onError === 'function') onError({ code: 'permission-denied' });
                return () => {};
            }
            const q = query(reviewsRef, orderBy('createdAt', 'desc'));
            return onSnapshot(q, (snap) => {
                callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, onError);
        };

        window.reviewSetStatus = function (id, status) {
            if (!['pending', 'approved', 'rejected'].includes(status)) {
                return Promise.reject(new Error('Invalid review status'));
            }
            return updateDoc(doc(db, 'reviews', id), { status });
        };

        window.reviewDelete = function (id) {
            return deleteDoc(doc(db, 'reviews', id));
        };

        if (typeof window.onReviewsReady === 'function') window.onReviewsReady();
    } catch (e) {
        console.error('Reviews init failed:', e);
        window.reviewsInitError = e;
    }
} else {
    console.info('Reviews not connected yet — Firebase is not configured.');
}
