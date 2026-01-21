import React, { useEffect, useState } from "react";
import {
  listenReservations,
  createReservationSafe,
  deleteReservation,
  updateReservation
} from "./services/reservationsRealtime";

// ⏱️ UTIL
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function App() {
  const [bookings, setBookings] = useState([]);
  const [info, setInfo] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [selectedISO, setSelectedISO] = useState("");

  // 🔴 REALTIME
  useEffect(() => {
    const unsub = listenReservations(setBookings);
    return () => unsub && unsub();
  }, []);

  // 🔴 KAYDET / GÜNCELLE
  async function saveBooking(payload) {
    try {
      const overlap = bookings
        .filter(
          b =>
            b.pitchId === payload.pitchId &&
            b.date === payload.date
        )
        .some(b =>
          rangesOverlap(
            payload.startTime,
            payload.endTime,
            b.startTime,
            b.endTime
          )
        );

      if (overlap) {
        setInfo("Bu saat dolu ❌");
        return;
      }

      if (editingId) {
        await updateReservation(editingId, payload);
        setEditingId(null);
        setInfo("Rezervasyon güncellendi ✅");
      } else {
        await createReservationSafe(payload);
        setInfo("Rezervasyon oluşturuldu ✅");
      }
    } catch {
      setInfo("İşlem başarısız ❌");
    }
  }

  // 🔴 SİL
  async function delBooking(booking) {
    if (!booking) return;

    // Abone → sadece bu haftayı iptal
    if (booking.matchType === "abone") {
      const ex = booking.aboneExceptions || [];
      if (!ex.includes(selectedISO)) {
        await updateReservation(booking.id, {
          aboneExceptions: [...ex, selectedISO]
        });
      }
      setInfo("Bu haftalık abonelik iptal edildi ✅");
      return;
    }

    // Normal maç
    await deleteReservation(booking.id);
    setInfo("Rezervasyon silindi ✅");
  }

  // 🔴 GELMEDİ
  async function markNoShow(booking) {
    if (!booking) return;
    await updateReservation(booking.id, { noShow: true });
    setInfo("Gelmedi işaretlendi ✅");
  }

  return (
    <div>
      {info && <div style={{ marginBottom: 10 }}>{info}</div>}

      {/*
        ⚠️ BURAYA MEVCUT UI’Nİ KOY
        - Kaydet → saveBooking(payload)
        - Sil → delBooking(booking)
        - Gelmedi → markNoShow(booking)
      */}
    </div>
  );
}

export default App;
