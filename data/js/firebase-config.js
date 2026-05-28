// Gebruik je eigen Firebase config (vervang met jouw waarden)
const firebaseConfig = {
  apiKey: "AIzaSyCO2ndD-lTBZpRrs-ZxIsBTVjPVza2sFXU",
  authDomain: "schoolquizapp-28abf.firebaseapp.com",
  projectId: "schoolquizapp-28abf",
  storageBucket: "schoolquizapp-28abf.firebasestorage.app",
  messagingSenderId: "921022621334",
  appId: "1:921022621334:web:ef582f1e067a77a41284b7"
};

// Initialiseer Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// Bingo collecties
const bingoSessions = db.collection("bingo_sessions");
const bingoPlayers = db.collection("bingo_players");
const bingoClaims = db.collection("bingo_claims");

// Helper: genereer 4-cijferige code
function generateSessionCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Anonieme login
function anonymousLogin() {
  return auth.signInAnonymously().catch(console.error);
}
