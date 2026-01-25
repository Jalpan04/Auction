// --- CONFIGURATION ---
// PRODUCTION MODE ONLY

// Real Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    onValue, 
    update, 
    push, 
    child,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


// YOUR FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyCph46fZBVagiKeEBBjs_f79kMKKcCVOQ4",
    authDomain: "myauction-app.firebaseapp.com",
    databaseURL: "https://myauction-app-default-rtdb.firebaseio.com",
    projectId: "myauction-app",
    storageBucket: "myauction-app.firebasestorage.app",
    messagingSenderId: "929050416416",
    appId: "1:929050416416:web:6d7836ef2f9b35179c3345",
    measurementId: "G-TVY1SF2HTH"
};

console.log("%c [SYSTEM] FIREBASE PRODUCTION MODE ", "background: green; color: white; font-size: 14px; font-weight: bold;");

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export { 
    db, 
    auth, 
    ref, 
    set, 
    get, 
    onValue, 
    update, 
    push, 
    child, 
    runTransaction,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    signInAnonymously
};
