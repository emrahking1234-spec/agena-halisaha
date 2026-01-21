import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  query
} from "firebase/firestore";

const COL = "reservations";

/** 🔴 REALTIME LISTENER – crash fix */
export function listenReservations(cb) {
  const q = query(collection(db, COL));

  const unsub = onSnapshot(
    q,
    (snap) => {
      const data = [];
      snap.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      cb(data);
    },
    (err) => {
      console.error("listenReservations error:", err);
    }
  );

  return unsub;
}

/** 🔴 SAFE CREATE */
export async function createReservationSafe(payload) {
  try {
    await addDoc(collection(db, COL), payload);
  } catch (err) {
    console.error("createReservationSafe error:", err);
    throw new Error("Rezervasyon kaydedilemedi");
  }
}
