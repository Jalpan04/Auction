// --- CONFIGURATION ---
const USE_MOCK = false; // PRODUCTION MODE

import * as MockFirebase from './mock-firebase.js';

// Real Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getDatabase, 
    ref as realRef, 
    set as realSet, 
    get as realGet, 
    onValue as realOnValue, 
    update as realUpdate, 
    push as realPush, 
    child as realChild 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

import { 
    getAuth, 
    signInWithEmailAndPassword as realSignInEmail, 
    createUserWithEmailAndPassword as realCreateUser, 
    onAuthStateChanged as realOnAuthChange, 
    signOut as realSignOut, 
    signInAnonymously as realSignInAnon 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { runTransaction as realRunTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";


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

let exportedAuth, exportedDb;

if (USE_MOCK) {
    console.log("%c [SYSTEM] RUNNING IN MOCK MODE ", "background: yellow; color: black; font-size: 14px; font-weight: bold;");
    exportedAuth = MockFirebase.auth;
    exportedDb = MockFirebase.db;
} else {
    console.log("%c [SYSTEM] RUNNING IN PRODUCTION MODE ", "background: green; color: white; font-size: 14px; font-weight: bold;");
    const app = initializeApp(firebaseConfig);
    exportedDb = getDatabase(app);
    exportedAuth = getAuth(app);
}

// Exports that automatically switch based on USE_MOCK
export const db = exportedDb;
export const auth = exportedAuth;

export const ref = USE_MOCK ? MockFirebase.ref : realRef;
export const set = USE_MOCK ? MockFirebase.set : realSet;
export const get = USE_MOCK ? MockFirebase.get : realGet;
export const child = USE_MOCK ? MockFirebase.child : realChild;
export const update = USE_MOCK ? MockFirebase.update : realUpdate;
export const push = USE_MOCK ? MockFirebase.push : realPush;
export const onValue = USE_MOCK ? MockFirebase.onValue : realOnValue;
export const runTransaction = USE_MOCK ? MockFirebase.runTransaction : realRunTransaction;

export const signInWithEmailAndPassword = USE_MOCK ? MockFirebase.signInWithEmailAndPassword : realSignInEmail;
export const createUserWithEmailAndPassword = USE_MOCK ? MockFirebase.createUserWithEmailAndPassword : realCreateUser;
export const onAuthStateChanged = USE_MOCK ? MockFirebase.onAuthStateChanged : realOnAuthChange;
export const signOut = USE_MOCK ? MockFirebase.signOut : realSignOut;
export const signInAnonymously = USE_MOCK ? MockFirebase.signInAnonymously : realSignInAnon;
