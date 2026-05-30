const firebaseConfig = {
  apiKey: "AIzaSyAJj3zDJo3VLl_LfKBrKZ-JbU8ZC5_j_-E",
  authDomain: "mootcoach-acbae.firebaseapp.com",
  projectId: "mootcoach-acbae",
  storageBucket: "mootcoach-acbae.firebasestorage.app",
  messagingSenderId: "323059898410",
  appId: "1:323059898410:web:d77cdf41b2e892b2bf8b53",
  measurementId: "G-L9KLT2ZDNE"
};

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebase = window.firebase;
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Get the modular App instance
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = firebase.firestore();
export const firebaseRef = firebase;

export { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile
};

let hasCheckedAuth = false;
export let currentUser = null;
const authListeners = [];

export function onAuthChanged(callback) {
  authListeners.push(callback);
  if (hasCheckedAuth) {
    callback(currentUser);
  }
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  hasCheckedAuth = true;
  authListeners.forEach(cb => cb(user));
});

