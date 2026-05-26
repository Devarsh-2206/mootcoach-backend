const firebaseConfig = {
  apiKey: "AIzaSyAJj3zDJo3VLl_LfKBrKZ-JbU8ZC5_j_-E",
  authDomain: "mootcoach-acbae.firebaseapp.com",
  projectId: "mootcoach-acbae",
  storageBucket: "mootcoach-acbae.firebasestorage.app",
  messagingSenderId: "323059898410",
  appId: "1:323059898410:web:d77cdf41b2e892b2bf8b53",
  measurementId: "G-L9KLT2ZDNE"
};

const firebase = window.firebase;
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export const firebaseRef = firebase;

export let currentUser = null;
const authListeners = [];

export function onAuthChanged(callback) {
  authListeners.push(callback);
  callback(currentUser);
}

auth.onAuthStateChanged(user => {
  currentUser = user;
  authListeners.forEach(cb => cb(user));
});
