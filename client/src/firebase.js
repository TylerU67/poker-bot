import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAUslJs8T9SqMOC2vq6OWKP4Qh-EmyJ4cU",
  authDomain: "poker-bot-a90c3.firebaseapp.com",
  projectId: "poker-bot-a90c3",
  storageBucket: "poker-bot-a90c3.firebasestorage.app",
  messagingSenderId: "884705843842",
  appId: "1:884705843842:web:e032b19072f68dfefe329b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app,
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  collection,
  addDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
};
