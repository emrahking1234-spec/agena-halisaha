import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDBtZWtw2hzj8mHvMVWD4F8XAdUsDQH5IU",
  authDomain: "agena-halisaha-75dd8.firebaseapp.com",
  projectId: "agena-halisaha-75dd8",
  storageBucket: "agena-halisaha-75dd8.firebasestorage.app",
  messagingSenderId: "782593473028",
  appId: "1:782593473028:web:5e2dca545f76383dfb9351"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
