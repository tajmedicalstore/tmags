/*
 * Taj Medical Store — Website & Admin System
 * Made By Farhan (Farhan Ali) — All Rights Reserved.
 * Contact: tajmedicalstoreofficial@gmail.com
 */

/* =========================================================
   CUSTOMER CHAT — real-time messaging between a visitor and
   the admin. Each visitor gets a private, anonymous Firebase
   identity (no signup needed); Firestore security rules (see
   firebase-sync.js) make sure only that visitor and the admin
   account can ever read their conversation — never another
   customer.

   Needs the same Firebase project as firebase-sync.js, with
   Anonymous sign-in enabled (see the setup comment there).
   Until that's done, the chat button still opens but shows a
   "not connected yet" notice instead of failing silently.
   ========================================================= */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, writeBatch, runTransaction,
    onSnapshot, query, orderBy, where, serverTimestamp, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { FIREBASE_CONFIG, isFirebaseConfigured, ADMIN_EMAIL_FOR_RULES } from "./firebase-config.js";

window.chatReady = false;

if (isFirebaseConfigured()) {
    try {
        const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
        const db = getFirestore(app);
        const auth = getAuth(app);

        try { enableIndexedDbPersistence(db); } catch (e) { /* multiple tabs open, or unsupported — ignore, still works online */ }

        window.chatReady = true;

        /* ---- Customer side: anonymous identity ---- */
        window.chatSignInVisitor = function (callback) {
            onAuthStateChanged(auth, (user) => {
                if (user) { callback(user.uid); return; }
                signInAnonymously(auth).catch(err => console.error('Anonymous sign-in failed:', err));
            });
        };

        window.chatSetVisitorProfile = function (visitorId, name, contact) {
            const ref = doc(db, 'conversations', visitorId);
            setDoc(ref, { name: name || 'Guest', contact: contact || '', updatedAt: serverTimestamp() }, { merge: true });
        };

        window.chatSendMessage = function (visitorId, sender, payload, legacyImageBase64) {
            // The UI sends a payload object for text/images/files/voice/polls/actions.
            // Keep backwards compatibility with the old (text, image) signature.
            if (typeof payload === 'string') payload = { text: payload, image: legacyImageBase64 || null };
            payload = payload && typeof payload === 'object' ? payload : {};
            const message = {
                sender: sender === 'admin' ? 'admin' : 'customer',
                text: typeof payload.text === 'string' ? payload.text : '',
                image: payload.image || null,
                file: payload.file || null,
                fileName: payload.fileName || null,
                voice: payload.voice || null,
                poll: payload.poll || null,
                actionButton: payload.actionButton || null,
                isBroadcast: !!payload.isBroadcast,
                timestamp: serverTimestamp(),
                deliveredAt: null,
                readAt: null,
                reactions: {}
            };
            if (!message.text && !message.image && !message.file && !message.voice && !message.poll && !message.actionButton) {
                return Promise.reject(new Error('Empty chat message'));
            }
            const msgRef = collection(db, 'conversations', visitorId, 'messages');
            const convRef = doc(db, 'conversations', visitorId);
            const preview = message.text ? message.text.slice(0, 60)
                : message.image ? '📷 Photo'
                : message.voice ? '🎤 Voice message'
                : message.file ? '📎 ' + (message.fileName || 'File')
                : message.poll ? '📊 ' + (message.poll.question || 'Poll').slice(0, 45)
                : message.actionButton ? '🔗 ' + (message.actionButton.text || 'Link')
                : 'Message';
            return Promise.all([
                addDoc(msgRef, message),
                setDoc(convRef, {
                    lastMessage: preview,
                    lastMessageTime: serverTimestamp(),
                    unreadByAdmin: sender === 'customer',
                    unreadByCustomer: sender === 'admin',
                    typingCustomer: false, typingAdmin: false
                }, { merge: true })
            ]).catch(err => {
                console.error('Chat send failed:', err);
                throw err;
            });
        };

        window.chatVotePoll = function (visitorId, messageId, optionIndex, voterId) {
            if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 20) {
                return Promise.reject(new Error('Invalid poll option'));
            }
            const ref = doc(db, 'conversations', visitorId, 'messages', messageId);
            return runTransaction(db, async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists()) throw new Error('Poll message not found');
                const data = snap.data();
                if (!data.poll || !Array.isArray(data.poll.options) || !voterId) throw new Error('Invalid poll');
                const options = data.poll.options.map(o => ({ ...o, votes: Array.isArray(o.votes) ? [...o.votes] : [] }));
                if (optionIndex >= options.length) throw new Error('Invalid poll option');
                options.forEach(o => { o.votes = o.votes.filter(v => v !== voterId); });
                options[optionIndex].votes.push(voterId);
                tx.update(ref, { 'poll.options': options });
            });
        };

        window.chatSetTyping = function(visitorId, sender, typing){
            if(!visitorId)return Promise.resolve();
            const field=sender==='admin'?'typingAdmin':'typingCustomer';
            return setDoc(doc(db,'conversations',visitorId),{[field]:!!typing,[field+'At']:serverTimestamp()},{merge:true});
        };
        window.chatListenTyping = function(visitorId, viewerSender, callback, onError){
            if(!visitorId)return null;
            return onSnapshot(doc(db,'conversations',visitorId),snap=>{
                const d=snap.exists()?snap.data():{};
                const otherTyping=viewerSender==='admin'?d.typingCustomer:d.typingAdmin;
                callback(!!otherTyping);
            },err=>{console.warn('Typing listener:',err);if(typeof onError==='function')onError(err);});
        };

        window.chatListenToThread = function (visitorId, callback, onError) {
            const q = query(collection(db, 'conversations', visitorId, 'messages'), orderBy('timestamp', 'asc'));
            return onSnapshot(q, (snap) => {
                const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                callback(messages);
            }, (err) => {
                console.error('Chat thread listen error:', err);
                if (typeof onError === 'function') onError(err);
            });
        };

        window.chatMarkRead = function (visitorId, byAdmin) {
            const ref = doc(db, 'conversations', visitorId);
            updateDoc(ref, byAdmin ? { unreadByAdmin: false } : { unreadByCustomer: false }).catch(() => {});
        };

        window.chatMarkMessagesDelivered = async function (visitorId, messages, viewerSender) {
            if (!visitorId || !Array.isArray(messages)) return;
            const batch = writeBatch(db); let count = 0;
            messages.forEach(m => {
                if (m.sender !== viewerSender && !m.deliveredAt) {
                    batch.update(doc(db,'conversations',visitorId,'messages',m.id), { deliveredAt: serverTimestamp() }); count++;
                }
            });
            if (count) await batch.commit();
        };

        window.chatMarkMessagesRead = async function (visitorId, messages, viewerSender) {
            if (!visitorId || !Array.isArray(messages)) return;
            const batch = writeBatch(db); let count = 0;
            messages.forEach(m => {
                if (m.sender !== viewerSender && !m.readAt) {
                    batch.update(doc(db,'conversations',visitorId,'messages',m.id), { deliveredAt: m.deliveredAt || serverTimestamp(), readAt: serverTimestamp() }); count++;
                }
            });
            if (count) await batch.commit();
            await updateDoc(doc(db,'conversations',visitorId), viewerSender==='admin' ? {unreadByAdmin:false} : {unreadByCustomer:false});
        };

        window.chatDeleteMessages = async function(visitorId, messageIds, requesterSender, mode) {
            if (!visitorId || !Array.isArray(messageIds) || !messageIds.length) throw new Error('No messages selected');
            const batch=writeBatch(db);
            const uid=auth.currentUser?.uid;
            const requester=requesterSender==='admin'?'admin':'customer';
            const refs=messageIds.map(id=>doc(db,'conversations',visitorId,'messages',id));
            const snaps=await Promise.all(refs.map(r=>getDoc(r)));
            snaps.forEach((snap,i)=>{
                if(!snap.exists())return; const data=snap.data(); const ref=refs[i];
                if(mode==='everyone'){
                    if(requester==='customer' && data.sender!=='customer') throw new Error('You can only delete your own messages for everyone.');
                    batch.update(ref,{deletedForEveryone:true,deletedAt:serverTimestamp(),deletedBy:requester});
                }else{
                    const old=Array.isArray(data.deletedFor)?data.deletedFor:[];
                    if(!old.includes(requester)) batch.update(ref,{deletedFor:[...old,requester]});
                }
            });
            await batch.commit();
        };

        window.chatCreateGroup = async function(name, members) {
            if(!auth.currentUser || auth.currentUser.email !== ADMIN_EMAIL_FOR_RULES) throw new Error('Only the admin can create groups.');
            const memberIds=members.map(m=>m.id).filter(Boolean);
            const memberNames={}; members.forEach(m=>{memberNames[m.id]=m.name||'Guest';});
            const ref=doc(collection(db,'chatGroups'));
            await setDoc(ref,{name:String(name).slice(0,80),createdBy:auth.currentUser.uid,memberIds,memberNames,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastMessage:'Group created'});
            return ref.id;
        };

        window.chatListenToGroups = function(callback,onError){
            const q=query(collection(db,'chatGroups'),orderBy('updatedAt','desc'));
            return onSnapshot(q,snap=>callback(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>{console.error('Group listen error:',err);if(typeof onError==='function')onError(err);});
        };

        window.chatListenToMyGroups = function(uid,callback,onError){
            if(!uid)return null;
            const q=query(collection(db,'chatGroups'),where('memberIds','array-contains',uid));
            return onSnapshot(q,snap=>callback(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>{console.error('My group listen error:',err);if(typeof onError==='function')onError(err);});
        };

        window.chatGetConversations = async function(){
            const snap=await getDocs(query(collection(db,'conversations'),orderBy('lastMessageTime','desc')));
            return snap.docs.map(d=>({id:d.id,...d.data()}));
        };

        window.chatListenToGroupThread = function(groupId,callback,onError){
            const q=query(collection(db,'chatGroups',groupId,'messages'),orderBy('timestamp','asc'));
            return onSnapshot(q,snap=>callback(snap.docs.map(d=>({id:d.id,...d.data()}))),err=>{console.error('Group thread error:',err);if(typeof onError==='function')onError(err);});
        };

        window.chatDeleteGroupMessages = async function(groupId,messageIds,requesterSender,mode){
            if(!groupId||!Array.isArray(messageIds)||!messageIds.length)throw new Error('No messages selected');
            const batch=writeBatch(db); const requester=requesterSender==='admin'?'admin':'customer';
            const refs=messageIds.map(id=>doc(db,'chatGroups',groupId,'messages',id));
            const snaps=await Promise.all(refs.map(r=>getDoc(r)));
            snaps.forEach((snap,i)=>{if(!snap.exists())return;const data=snap.data();const ref=refs[i];if(mode==='everyone'){if(requester==='customer'&&data.sender!=='customer')throw new Error('You can only delete your own messages for everyone.');batch.update(ref,{deletedForEveryone:true,deletedAt:serverTimestamp(),deletedBy:requester});}else{const old=Array.isArray(data.deletedFor)?data.deletedFor:[];if(!old.includes(requester))batch.update(ref,{deletedFor:[...old,requester]});}});
            await batch.commit();
        };

        window.chatSendGroupMessage = function(groupId,sender,payload){
            if(!groupId)return Promise.reject(new Error('Group not found'));
            payload=payload&&typeof payload==='object'?payload:{};
            const message={sender:sender==='admin'?'admin':'customer',text:typeof payload.text==='string'?payload.text:'',image:payload.image||null,file:payload.file||null,fileName:payload.fileName||null,voice:payload.voice||null,timestamp:serverTimestamp(),reactions:{},deletedFor:[]};
            if(!message.text&&!message.image&&!message.file&&!message.voice)return Promise.reject(new Error('Empty group message'));
            return addDoc(collection(db,'chatGroups',groupId,'messages'),message);
        };

        window.chatReactMessage = function(visitorId, messageId, voterId, emoji) {
            if (!visitorId || !messageId || !voterId || !emoji) return Promise.reject(new Error('Invalid reaction'));
            const ref=doc(db,'conversations',visitorId,'messages',messageId);
            return runTransaction(db, async tx=>{
                const snap=await tx.get(ref); if(!snap.exists()) throw new Error('Message not found');
                const data=snap.data(), reactions={...(data.reactions||{})};
                Object.keys(reactions).forEach(k=>{ reactions[k]=Array.isArray(reactions[k])?reactions[k].filter(x=>x!==voterId):[]; });
                reactions[emoji]=Array.isArray(reactions[emoji])?[...reactions[emoji],voterId]:[voterId];
                tx.update(ref,{reactions});
            });
        };

        /* ---- Admin side: inbox of every conversation ---- */
        window.chatListenToAllConversations = function (callback, onError) {
            const q = query(collection(db, 'conversations'), orderBy('lastMessageTime', 'desc'));
            return onSnapshot(q, (snap) => {
                const conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                callback(conversations);
            }, (err) => {
                console.error('Chat inbox listen error:', err);
                if (typeof onError === 'function') onError(err);
            });
        };

        window.chatAdminSignedIn = function () {
            return auth.currentUser && auth.currentUser.email === ADMIN_EMAIL_FOR_RULES;
        };

        // Sends one message to every EXISTING conversation at once — reaches
        // customers who have already messaged at least once. New visitors who
        // start a chat after a broadcast won't see past broadcasts (there's no
        // customer directory beyond people who've opened a conversation).
        window.chatSendBroadcast = async function (text, imageBase64) {
            const snap = await getDocs(collection(db, 'conversations'));
            const batch = writeBatch(db);
            const preview = '📢 ' + (text ? text.slice(0, 55) : 'Photo announcement');
            snap.forEach((convDoc) => {
                const msgRef = doc(collection(db, 'conversations', convDoc.id, 'messages'));
                batch.set(msgRef, {
                    sender: 'admin', text: text || '', image: imageBase64 || null,
                    isBroadcast: true, timestamp: serverTimestamp()
                });
                batch.set(doc(db, 'conversations', convDoc.id), {
                    lastMessage: preview, lastMessageTime: serverTimestamp(), unreadByCustomer: true
                }, { merge: true });
            });
            await batch.commit();
            return snap.size;
        };

        if (typeof window.onChatReady === 'function') window.onChatReady();
    } catch (e) {
        console.error('Chat init failed:', e);
        window.chatInitError = e;
    }
} else {
    console.info('Chat not connected yet — Firebase isn\'t configured. See the FIREBASE SETUP comment in firebase-sync.js.');
}
