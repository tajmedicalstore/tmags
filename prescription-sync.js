import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { FIREBASE_CONFIG, isFirebaseConfigured } from "./firebase-config.js";

if (isFirebaseConfigured()) {
  try {
    const app=getApps().length?getApp():initializeApp(FIREBASE_CONFIG), db=getFirestore(app), storage=getStorage(app), auth=getAuth(app);
    window.tmsSavePrescription=async function(data,file){
      let imageUrl='';
      if(file){
        const safe=(file.name||'prescription.jpg').replace(/[^a-z0-9._-]/gi,'_');
        const r=ref(storage,`prescriptions/${Date.now()}_${safe}`);
        await uploadBytes(r,file,{contentType:file.type||'image/jpeg'}); imageUrl=await getDownloadURL(r);
      }
      const user=auth.currentUser;
      return addDoc(collection(db,'prescriptionRequests'),{...data,imageUrl,uid:user?.uid||'',email:user?.email||'',status:'new',createdAt:serverTimestamp()});
    };
    window.tmsListenPrescriptions=function(callback,onError){
      return onSnapshot(collection(db,'prescriptionRequests'),snap=>{const rows=snap.docs.map(d=>({id:d.id,...d.data()}));rows.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));callback(rows);},onError);
    };
  } catch(e){ console.error('Prescription system init failed',e); }
}
