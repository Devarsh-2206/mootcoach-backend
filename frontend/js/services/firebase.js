const firebaseConfig = {
  apiKey: "AIzaSyAJj3zDJo3VLl_LfKBrKZ-JbU8ZC5_j_-E",
  authDomain: "mootcoach-acbae.firebaseapp.com",
  projectId: "mootcoach-acbae",
  storageBucket: "mootcoach-acbae.firebasestorage.app",
  messagingSenderId: "323059898410",
  appId: "1:323059898410:web:d77cdf41b2e892b2bf8b53",
  measurementId: "G-L9KLT2ZDNE"
};

// Auth and Firestore both go through the compat SDK (the <script>-loaded
// firebase-app-compat.js / firebase-auth-compat.js / firebase-firestore-compat.js
// bundles) so they are guaranteed to share the exact same app and auth
// state. Previously `auth` was built from the separately-loaded modular SDK
// (getAuth(app), from the ES-module firebase-auth.js) while `db` used
// compat's firebase.firestore() — two independent SDK instances that never
// shared sign-in state. That's why firebase.auth().currentUser stayed null
// even for a genuinely signed-in user: sign-in only ever updated the
// modular Auth instance. Every direct Firestore read/write from `db` went
// out with no auth context attached and was correctly rejected by the
// security rules as "Missing or insufficient permissions" — this was true
// the entire time, regardless of what the rules said.
const firebase = window.firebase;
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export const firebaseRef = firebase;

// Thin wrappers matching the modular SDK's call signature —
// functionName(authInstanceOrUser, ...args) — so every existing call site
// (app.js) keeps working completely unchanged, while actually delegating
// to compat methods on the same `auth` instance `db` shares an app with.
export function signInWithEmailAndPassword(authInstance, email, password) {
  return authInstance.signInWithEmailAndPassword(email, password);
}
export function createUserWithEmailAndPassword(authInstance, email, password) {
  return authInstance.createUserWithEmailAndPassword(email, password);
}
export function onAuthStateChanged(authInstance, callback) {
  return authInstance.onAuthStateChanged(callback);
}
export function signOut(authInstance) {
  return authInstance.signOut();
}
export function signInWithPopup(authInstance, provider) {
  return authInstance.signInWithPopup(provider);
}
export const GoogleAuthProvider = firebase.auth.GoogleAuthProvider;
export function sendPasswordResetEmail(authInstance, email) {
  return authInstance.sendPasswordResetEmail(email);
}
export function updateProfile(user, data) {
  return user.updateProfile(data);
}

let hasCheckedAuth = false;
export let currentUser = null;
const authListeners = [];

export function onAuthChanged(callback) {
  authListeners.push(callback);
  if (hasCheckedAuth) {
    callback(currentUser);
  }
}

auth.onAuthStateChanged(user => {
  currentUser = user;
  hasCheckedAuth = true;
  authListeners.forEach(cb => cb(user));
});
