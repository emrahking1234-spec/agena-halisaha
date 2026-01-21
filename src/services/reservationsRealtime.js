import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  doc
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Realtime dinleme
 * callback: (reservations[]) => void
 */
export function listenReservations(callback) {
  const q = query(collection(db, "reservations"));
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(data);
  });
}

/**
 * ÇAKIŞMA ENGELLİ rezervasyon ekleme
 * Aynı saha + tarih + saat aralığı varsa KAYDETMEZ
 */
export async function createReservationSafe(payload) {
  const colRef = collection(db, "reservations");

  await runTransaction(db, async (tx) => {
    const q = query(
      colRef,
      where("pitchId", "==", payload.pitchId),
      where("date", "==", payload.date)
    );

    // mevcutları oku
    const snap = await tx.get(q);

    // saat çakışma kontrolü
    const overlap = snap.docs.some(d => {
      const r = d.data();
      return !(
        payload.endTime <= r.startTime ||
        payload.startTime >= r.endTime
      );
    });

    if (overlap) {
      throw new Error("Bu saat aralığı dolu");
    }

    // güvenli ekle
    const newRef = doc(colRef);
    tx.set(newRef, payload);
  });
}
