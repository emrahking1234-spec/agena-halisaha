import {
  createReservationSafe,
  updateReservation,
  deleteReservation
} from "../services/reservationsRealtime";

export function checkOverlap(bookings, payload) {
  return bookings.some(b =>
    b.date === payload.date &&
    b.pitchId === payload.pitchId &&
    rangesOverlap(payload.startTime, payload.endTime, b.startTime, b.endTime)
  );
}

export async function saveBooking({
  bookings,
  payload,
  editingId
}) {
  if (checkOverlap(bookings, payload)) {
    throw new Error("Bu saat dolu");
  }

  if (editingId) {
    await updateReservation(editingId, payload);
    return "Rezervasyon güncellendi";
  } else {
    await createReservationSafe(payload);
    return "Rezervasyon oluşturuldu";
  }
}

export async function deleteBooking(booking, selectedISO) {
  if (booking.matchType === "abone" && booking._virtual) {
    const ex = booking.aboneExceptions || [];
    if (!ex.includes(selectedISO)) {
      await updateReservation(booking.id, {
        aboneExceptions: [...ex, selectedISO]
      });
    }
    return "Bu haftalık abonelik iptal edildi";
  }

  await deleteReservation(booking.id);
  return "Rezervasyon silindi";
}

export async function skipAboneWeek(master, selectedISO) {
  const ex = master.aboneExceptions || [];
  if (!ex.includes(selectedISO)) {
    await updateReservation(master.id, {
      aboneExceptions: [...ex, selectedISO]
    });
  }
  return "Bu hafta ertelendi";
}

/* UTIL */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
