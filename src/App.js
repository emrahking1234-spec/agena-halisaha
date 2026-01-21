import React, { useEffect, useMemo, useRef, useState } from "react";
import { listenReservations, createReservationSafe, deleteReservation, updateReservation } from "./services/reservationsRealtime";

/** LocalStorage Keys */
const LS_USERS = "hs_users_v2";
const LS_SESSION = "hs_session_v2";
const LS_REMEMBER = "hs_remember_v1";
const LS_BOOKINGS = "hs_bookings_v11";
const LS_BLACKLIST = "hs_blacklist_v2";
const LS_LOGS = "hs_logs_v3";
const LS_PITCHES = "hs_pitches_v7";
const LS_CUSTOMERS = "hs_customers_v1";

const TIME_POINTS = [
  "08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00",
  "17:00","18:00","19:00","20:00","21:00","22:00","23:00","24:00"
];

const MATCH_TYPES = [
  { key: "tek", label: "Tek Maç", color: "#5bd6ff", bg: "rgba(91,214,255,0.16)" },
  { key: "abone", label: "Abone", color: "#48ffa8", bg: "rgba(72,255,168,0.14)" },
  { key: "gunduz", label: "Gündüz Maçı", color: "#ffd36b", bg: "rgba(255,211,107,0.14)" },
  { key: "kurs", label: "Kurs", color: "#a07bff", bg: "rgba(160,123,255,0.14)" }
];

function safeParse(raw, fallback) {
  try { const v = JSON.parse(raw); return v ?? fallback; } catch { return fallback; }
}
function load(key, fallback) { return safeParse(localStorage.getItem(key), fallback); }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function remove(key) { localStorage.removeItem(key); }

function normalizePhone(s) { return (s || "").replace(/\D/g, "").slice(0, 11); }
function formatPhoneTR(raw) {
  const d = normalizePhone(raw);
  if (d.length === 11 && d.startsWith("0")) {
    const x = d.slice(1);
    return `${x.slice(0,3)} ${x.slice(3,6)} ${x.slice(6,8)} ${x.slice(8,10)}`;
  }
  if (d.length === 10) return `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,8)} ${d.slice(8,10)}`;
  return d.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}
function timeToMinutes(t) {
  const [hh, mm] = (t || "00:00").split(":").map(Number);
  return (hh * 60) + (mm || 0);
}
function rangeLabel(start, end) { return `${start} - ${end}`; }
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const a1 = timeToMinutes(aStart), a2 = timeToMinutes(aEnd);
  const b1 = timeToMinutes(bStart), b2 = timeToMinutes(bEnd);
  return a1 < b2 && b1 < a2;
}
function addDays(iso, days) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToISO(d);
}
function weekdayIndexFromISO(iso) {
  const d = isoToDate(iso);
  const js = d.getDay();
  const map = [6,0,1,2,3,4,5];
  return map[js];
}
function sameWeekday(aIso, bIso) {
  return weekdayIndexFromISO(aIso) === weekdayIndexFromISO(bIso);
}
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function isoToDate(iso) { const [y,m,d]=iso.split("-").map(Number); return new Date(y,m-1,d); }
function dateToISO(d) {
  const yyyy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function daysInMonth(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth()+1, 0).getDate();
}
function monthLabelTR(dateObj) {
  const months = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  return `${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}
function trWeekdayShort(idx) {
  const arr = ["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"];
  return arr[idx] || "";
}
function buildMonthDaysOnly(monthDate) {
  const total = daysInMonth(monthDate);
  const days = [];
  for (let day = 1; day <= total; day++) {
    const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    days.push({ day, iso: dateToISO(d) });
  }
  return days;
}

function ensureDefaultData() {
  const users = load(LS_USERS, []);
  const hasAdmin = users.some((u) => u.role === "admin" && u.username === "admin");
  const hasOwner = users.some((u) => u.role === "owner" && u.username === "Ali Rıza");
  if (!hasAdmin) users.push({ id:"admin-1", username:"admin", password:"1234", role:"admin", createdAt:Date.now() });
  if (!hasOwner) users.push({ id:"owner-1", username:"Ali Rıza", password:"3434", role:"owner", createdAt:Date.now() });
  save(LS_USERS, users);

  if (!localStorage.getItem(LS_BOOKINGS)) save(LS_BOOKINGS, []);
  if (!localStorage.getItem(LS_BLACKLIST)) save(LS_BLACKLIST, []);
  if (!localStorage.getItem(LS_LOGS)) save(LS_LOGS, []);
  if (!localStorage.getItem(LS_CUSTOMERS)) save(LS_CUSTOMERS, []);

  if (!localStorage.getItem(LS_PITCHES)) {
    save(LS_PITCHES, [
      { id:"p1", name:"Halı Saha 1" },
      { id:"p2", name:"Halı Saha 2" }
    ]);
  }
}

function isBlacklisted(phone) {
  const bl = load(LS_BLACKLIST, []);
  const p = normalizePhone(phone);
  if (!p) return false;
  return bl.some((x) => normalizePhone(x.phone) === p);
}

/** ✅ CUSTOMER HELPERS */
function upsertCustomerFromBooking({ phone, firstName, lastName, note }) {
  const phoneN = normalizePhone(phone);
  if (!phoneN) return;
  const list = load(LS_CUSTOMERS, []);
  const idx = list.findIndex(c => normalizePhone(c.phone) === phoneN);

  const nextItem = {
    id: idx >= 0 ? list[idx].id : ("c-" + Date.now() + "-" + Math.random().toString(16).slice(2)),
    phone: phoneN,
    firstName: (firstName || "").trim(),
    lastName: (lastName || "").trim(),
    note: (note || "").trim(),
    updatedAt: Date.now(),
    createdAt: idx >= 0 ? (list[idx].createdAt || Date.now()) : Date.now(),
  };

  if (idx >= 0) {
    const old = list[idx];
    nextItem.note = (nextItem.note ? nextItem.note : (old.note || ""));
    nextItem.firstName = nextItem.firstName || old.firstName || "";
    nextItem.lastName = nextItem.lastName || old.lastName || "";
    list[idx] = { ...old, ...nextItem };
    save(LS_CUSTOMERS, list);
    return;
  }
  save(LS_CUSTOMERS, [nextItem, ...list].slice(0, 3000));
}

function findCustomerByPhone(phone) {
  const phoneN = normalizePhone(phone);
  if (!phoneN) return null;
  const list = load(LS_CUSTOMERS, []);
  return list.find(c => normalizePhone(c.phone) === phoneN) || null;
}

function addLog(entry) {
  const list = load(LS_LOGS, []);
  const next = [{
    id: "log-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    at: Date.now(),
    ...entry
  }, ...list].slice(0, 1800);
  save(LS_LOGS, next);
}
function fmtLogTime(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

/** Background particles */
function ParticlesBG() {
  const dots = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 2 + Math.random() * 6,
    dur: 7 + Math.random() * 11,
    delay: Math.random() * 4,
    alpha: 0.08 + Math.random() * 0.15
  })), []);

  return (
    <div style={styles.particlesWrap} aria-hidden="true">
      {dots.map(d => (
        <div
          key={d.id}
          style={{
            ...styles.particle,
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            opacity: d.alpha,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`
          }}
        />
      ))}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-120vh) rotate(260deg); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: translateY(-8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeSlide {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes panelIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Watermark logo from /public/logo.png */
function LogoWatermark() {
  const logoUrl = `${process.env.PUBLIC_URL}/logo.png`;
  return <div style={{ ...styles.logoBg, backgroundImage: `url("${logoUrl}")` }} aria-hidden="true" />;
}

/** Generic modal */
function Modal({ title, children, onClose }) {
  useEffect(() => {
    function onKey(e){ if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modalCard} onMouseDown={(e)=>e.stopPropagation()}>
        <div style={styles.modalTop}>
          <div style={styles.modalTitle}>{title}</div>
          <button className="hoverable" style={styles.modalClose} onClick={onClose}>Kapat</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** ✅ CUSTOMER PANEL (Top Right) */
function CustomerPanel({ onClose }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState(() => load(LS_CUSTOMERS, []));
  const [editId, setEditId] = useState(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    const t = setInterval(() => setList(load(LS_CUSTOMERS, [])), 700);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter(c => {
      const phone = normalizePhone(c.phone || "");
      const name = `${c.firstName||""} ${c.lastName||""}`.toLowerCase();
      const note = (c.note || "").toLowerCase();
      return phone.includes(normalizePhone(qq)) || name.includes(qq) || note.includes(qq);
    });
  }, [q, list]);

  function beginEdit(c) {
    setEditId(c.id);
    setEditFirst((c.firstName || "").trim());
    setEditLast((c.lastName || "").trim());
    setEditPhone(formatPhoneTR(c.phone || ""));
    setEditNote((c.note || "").trim());
  }

  function cancelEdit() {
    setEditId(null);
    setEditFirst("");
    setEditLast("");
    setEditPhone("");
    setEditNote("");
  }

  function saveEdit() {
    if (!editId) return;
    const phoneN = normalizePhone(editPhone);
    if (!phoneN) return;

    const all = load(LS_CUSTOMERS, []);
    const idx = all.findIndex(x => x.id === editId);
    if (idx < 0) return cancelEdit();

    const nextItem = {
      ...all[idx],
      firstName: (editFirst || "").trim(),
      lastName: (editLast || "").trim(),
      phone: phoneN,
      note: (editNote || "").trim(),
      updatedAt: Date.now(),
    };

    // aynı telefondan başka kayıt varsa (edit dışı) birleştir: yeni kaydı tut, diğerini sil
    const dupIdx = all.findIndex(x => x.id !== editId && normalizePhone(x.phone) === phoneN);
    let nextAll = [...all];
    if (dupIdx >= 0) {
      const keep = nextItem;
      const other = nextAll[dupIdx];
      // notu kaybetme
      keep.note = keep.note || (other.note || "");
      keep.firstName = keep.firstName || (other.firstName || "");
      keep.lastName = keep.lastName || (other.lastName || "");
      // remove higher index first
      nextAll = nextAll.filter(x => x.id !== other.id);
      const keepIdx = nextAll.findIndex(x => x.id === editId);
      nextAll[keepIdx] = keep;
    } else {
      nextAll[idx] = nextItem;
    }

    save(LS_CUSTOMERS, nextAll);
    setList(nextAll);
    cancelEdit();
  }

  function deleteCustomer(id) {
    const all = load(LS_CUSTOMERS, []);
    const next = all.filter(x => x.id !== id);
    save(LS_CUSTOMERS, next);
    setList(next);
    if (editId === id) cancelEdit();
  }

  return (
    <div style={styles.listPanel}>
      <div style={styles.listPanelTitle}>
        Müşteri Kayıtları
        <button className="hoverable" style={styles.detailClose} onClick={onClose}>Kapat</button>
      </div>

      <div style={{ display:"grid", gap:8, marginBottom:10 }}>
        <div style={styles.label}>Ara (telefon / isim / not)</div>
        <input style={styles.input} value={q} onChange={(e)=>setQ(e.target.value)} placeholder="örn: 5347758292 / mehmet / not..." />
      </div>

      {editId ? (
        <div style={{ ...styles.formBox, marginBottom: 12 }}>
          <div style={styles.formBoxTitle}>
            Müşteri Düzenle
            <button className="hoverable" style={styles.btnGhost} onClick={cancelEdit}>Vazgeç</button>
          </div>

          <div style={styles.grid2}>
            <FieldSmall label="Ad" value={editFirst} onChange={setEditFirst} placeholder="Ad" />
            <FieldSmall label="Soyad" value={editLast} onChange={setEditLast} placeholder="Soyad" />
          </div>

          <FieldSmall label="Telefon" value={editPhone} onChange={setEditPhone} placeholder="05xxxxxxxxx" />
          <FieldSmall label="Not" value={editNote} onChange={setEditNote} placeholder="opsiyonel" />

          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap", marginTop: 10 }}>
            <button className="hoverable" style={styles.btnPrimary} onClick={saveEdit}>Kaydet</button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div style={styles.empty}>Kayıt bulunamadı.</div>
      ) : (
        <div style={{ display:"grid", gap:10, maxHeight: 360, overflow:"auto", paddingRight:6 }}>
          {filtered.slice(0, 400).map(c => (
            <div key={c.id} style={styles.listRow}>
              <div style={styles.textWhiteStrong}>
                {(c.firstName||"-")} {(c.lastName||"")}
              </div>
              <div style={styles.textWhite}>{formatPhoneTR(c.phone || "")}</div>
              <div style={styles.textMutedSmall}>Not: {c.note ? c.note : "-"}</div>
              <div style={styles.textMutedSmall}>Güncelleme: {c.updatedAt ? fmtLogTime(c.updatedAt) : "-"}</div>

              <div style={styles.listRowActions}>
                <button className="hoverable" style={styles.btnGhost} onClick={()=>beginEdit(c)}>Düzenle</button>
                <button className="hoverable" style={styles.btnDanger} onClick={()=>deleteCustomer(c.id)}>Sil</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** App */
export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    ensureDefaultData();

    const remember = load(LS_REMEMBER, { remember:false });
    if (remember?.remember) {
      const s = load(LS_SESSION, null);
      if (s?.user) setSession(s);
    } else {
      remove(LS_SESSION);
      setSession(null);
    }
  }, []);

  function logout() {
    remove(LS_SESSION);
    setSession(null);
  }

  const currentUser = session?.user || null;

  return (
    <div style={styles.pageWrap}>
      <LogoWatermark />
      <ParticlesBG />

      <div style={styles.page}>
        <div style={styles.shell}>
          <TopBar currentUser={currentUser} onLogout={logout} />
          <div style={styles.card}>
            {!currentUser ? (
              <LoginOnly onLogin={(user) => { setSession({ user }); }} />
            ) : (
              <AdminLikePanel role={currentUser.role} currentUsername={currentUser.username} />
            )}
          </div>
        </div>
      </div>

      {/* ✅ MOBIL FIX: yatay taşmayı kapat + grid’i mobilde tek kolona düşür */}
      <style>{`
        html, body { width: 100%; max-width: 100%; overflow-x: hidden; }
        * { box-sizing: border-box; }
        input::placeholder { color: rgba(255,255,255,0.72); }
        button { transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease, background .14s ease, filter .14s ease; }
        .hoverable:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0,0,0,0.26); border-color: rgba(255,255,255,0.42) !important; filter: saturate(1.08); }

        /* Mobilde iki kolon yerine tek kolon */
        @media (max-width: 860px) {
          .hs-gridAdmin2 { grid-template-columns: 1fr !important; }
          .hs-grid2 { grid-template-columns: 1fr !important; }
          .hs-bottomGrid { grid-template-columns: 1fr !important; }
          .hs-shell { width: min(1240px, 98vw) !important; }
        }
      `}</style>
    </div>
  );
}

/** TopBar */
function TopBar({ currentUser, onLogout }) {
  return (
    <div style={styles.topbar}>
      <div style={styles.brandLeft}>
        <div style={styles.logoDot} />
      </div>

      {currentUser ? (
        <div style={styles.userBox}>
          <div style={styles.userLine}>
            <span style={styles.userName}>{currentUser.username}</span>
            <span style={styles.badge}>
              {currentUser.role === "owner" ? "yönetici" : "admin"}
            </span>
          </div>
          <button className="hoverable" style={styles.btnGhost} onClick={onLogout}>Çıkış</button>
        </div>
      ) : (
        <div style={styles.badgeSoft}>Giriş</div>
      )}
    </div>
  );
}

/** Login */
function LoginOnly({ onLogin }) {
  const remembered = load(LS_REMEMBER, { remember:false, username:"", password:"" });

  const [username, setUsername] = useState(remembered.username || "");
  const [password, setPassword] = useState(remembered.password || "");
  const [remember, setRemember] = useState(!!remembered.remember);
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState("");

  function login(e) {
    e.preventDefault();
    setMsg("");
    const u = username.trim();
    const p = password;
    if (!u || !p) return setMsg("İsim ve şifre zorunlu.");

    const users = load(LS_USERS, []);
    const found = users.find((x) => x.username === u && x.password === p);
    if (!found) return setMsg("Hatalı isim veya şifre.");

    save(LS_REMEMBER, { remember, username: remember ? u : "", password: remember ? p : "" });

    if (remember) {
      save(LS_SESSION, { user: { id: found.id, username: found.username, role: found.role } });
    } else {
      remove(LS_SESSION);
    }

    onLogin({ id: found.id, username: found.username, role: found.role });
  }

  return (
    <div style={styles.authWrap}>
      <div style={styles.authInner}>
        <div style={styles.loginBigWatermark} aria-hidden="true">
          <div style={styles.loginBigAgena}>AGENA</div>
        </div>

        <div style={styles.authBrand}>Agena Halısaha</div>
        <div style={styles.authTitle}>Giriş Yap</div>

        <form onSubmit={login} style={styles.formWide}>
          <FieldSmall label="İsim" value={username} onChange={setUsername} placeholder="kullanıcı adı" />

          <div style={{ display:"grid", gap:6, minWidth:0 }}>
            <div style={styles.label}>Şifre</div>
            <div style={styles.passRow}>
              <input
                style={{ ...styles.inputSmall, flex:1, minWidth:0 }}
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
                placeholder="şifre"
                type={showPass ? "text" : "password"}
              />
              <button
                type="button"
                className="hoverable"
                style={styles.passBtn}
                onClick={()=>setShowPass((s)=>!s)}
                title="Şifreyi göster"
              >
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <label style={styles.rememberRow}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e)=>setRemember(e.target.checked)}
              style={{ transform:"scale(1.05)" }}
            />
            <span style={styles.rememberText}>Beni hatırla</span>
          </label>

          {msg ? <div style={styles.msgWarn}>{msg}</div> : null}
          <button className="hoverable" style={styles.btnPrimary} type="submit">Giriş Yap</button>
        </form>
      </div>
    </div>
  );
}

function FieldSmall({ label, value, onChange, placeholder, type="text" }) {
  return (
    <div style={{ display:"grid", gap:6, minWidth:0 }}>
      <div style={styles.label}>{label}</div>
      <input
        style={{ ...styles.inputSmall, minWidth:0 }}
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}

/** Logs Panel */
function LogsPanel({ onClose }) {
  const [logs, setLogs] = useState(() => load(LS_LOGS, []));

  useEffect(() => {
    const t = setInterval(() => setLogs(load(LS_LOGS, [])), 700);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={styles.listPanel}>
      <div style={styles.listPanelTitle}>
        Loglar
        <button className="hoverable" style={styles.detailClose} onClick={onClose}>Kapat</button>
      </div>

      {logs.length === 0 ? (
        <div style={styles.empty}>Henüz log yok.</div>
      ) : (
        <div style={{ display:"grid", gap:10, maxHeight: 340, overflow:"auto", paddingRight:6, minWidth:0 }}>
          {logs.slice(0, 260).map((l)=>(
            <div key={l.id} style={styles.listRow}>
              <div style={{ ...styles.textWhiteStrong, overflowWrap:"anywhere" }}>
                {l.action || "İşlem"} {l.by ? <span style={styles.logPill}>@{l.by}</span> : null}
              </div>
              <div style={styles.textWhite}>{fmtLogTime(l.at)}</div>
              {l.detail ? <div style={{ ...styles.textMutedSmall, overflowWrap:"anywhere" }}>{l.detail}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Blacklist Panel */
function BlacklistPanel({ currentUsername, onClose }) {
  const [items, setItems] = useState(() => load(LS_BLACKLIST, []));

  function refresh() { setItems(load(LS_BLACKLIST, [])); }
  function removeFromBlacklist(id) {
    const next = load(LS_BLACKLIST, []).filter(x => x.id !== id);
    save(LS_BLACKLIST, next);
    addLog({ action:"Kara listeden çıkarıldı", by: currentUsername, detail:`id=${id}` });
    refresh();
  }

  return (
    <div style={styles.listPanel}>
      <div style={styles.listPanelTitle}>
        Kara Liste
        <button className="hoverable" style={styles.detailClose} onClick={onClose}>Kapat</button>
      </div>

      {items.length === 0 ? (
        <div style={styles.empty}>Kara liste boş.</div>
      ) : (
        <div style={{ display:"grid", gap:10, minWidth:0 }}>
          {items.slice().sort((a,b)=> (b.createdAt||0) - (a.createdAt||0)).map((x)=>(
            <div key={x.id} style={styles.listRow}>
              <div style={{ ...styles.textWhiteStrong, overflowWrap:"anywhere" }}>{x.name || "-"}</div>
              <div style={{ ...styles.textWhite, overflowWrap:"anywhere" }}>{formatPhoneTR(x.phone || "")}</div>
              {x.note ? <div style={{ ...styles.textMutedSmall, overflowWrap:"anywhere" }}>Not: {x.note}</div> : null}
              <div style={styles.listRowActions}>
                <button className="hoverable" style={styles.btnDanger} onClick={()=>removeFromBlacklist(x.id)}>Listeden Çıkar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Owner User Management (✅ app içi silme modal) */
function UserManagement({ currentUsername, onClose }) {
  const [users, setUsers] = useState(() => load(LS_USERS, []));
  const [uName, setUName] = useState("");
  const [uPass, setUPass] = useState("");
  const [uRole, setURole] = useState("admin");
  const [msg, setMsg] = useState("");

  const [passModalOpen, setPassModalOpen] = useState(false);
  const [passTargetId, setPassTargetId] = useState(null);
  const [passTargetName, setPassTargetName] = useState("");
  const [newPass, setNewPass] = useState("");
  const newPassRef = useRef(null);

  const [delOpen, setDelOpen] = useState(false);
  const [delId, setDelId] = useState(null);
  const [delName, setDelName] = useState("");

  function refresh() { setUsers(load(LS_USERS, [])); }

  function createUser() {
    setMsg("");
    const username = uName.trim();
    const password = uPass;
    if (!username || !password) return setMsg("Kullanıcı adı ve şifre zorunlu.");
    const list = load(LS_USERS, []);
    if (list.some(x => x.username === username)) return setMsg("Bu kullanıcı adı zaten var.");
    const role = uRole === "owner" ? "owner" : "admin";
    const newU = { id:"u-"+Date.now(), username, password, role, createdAt: Date.now() };
    list.push(newU);
    save(LS_USERS, list);
    addLog({ action:"Yetkili oluşturuldu", by: currentUsername, detail:`${username} (${role})` });
    setUName(""); setUPass(""); setMsg("Kullanıcı oluşturuldu ✅");
    refresh();
  }

  function openPassModal(userId) {
    const list = load(LS_USERS, []);
    const u = list.find(x => x.id === userId);
    if (!u) return;
    setPassTargetId(userId);
    setPassTargetName(u.username);
    setNewPass("");
    setPassModalOpen(true);
    setTimeout(() => { try { newPassRef.current?.focus(); } catch {} }, 0);
  }

  function confirmPassChange() {
    if (!newPass) return;
    const list = load(LS_USERS, []);
    const u = list.find(x => x.id === passTargetId);
    if (!u) return;
    const next = list.map(x => x.id === passTargetId ? { ...x, password: newPass } : x);
    save(LS_USERS, next);
    addLog({ action:"Şifre değiştirildi", by: currentUsername, detail:`${u.username}` });
    setPassModalOpen(false);
    refresh();
    setMsg("Şifre güncellendi ✅");
  }

  function askDeleteUser(userId) {
    const list = load(LS_USERS, []);
    const u = list.find(x => x.id === userId);
    if (!u) return;
    if (u.username === "Ali Rıza") {
      setMsg("Yönetici silinemez.");
      return;
    }
    setDelId(userId);
    setDelName(u.username);
    setDelOpen(true);
  }

  function confirmDeleteUser() {
    const list = load(LS_USERS, []);
    const u = list.find(x => x.id === delId);
    const next = list.filter(x => x.id !== delId);
    save(LS_USERS, next);
    addLog({ action:"Yetkili silindi", by: currentUsername, detail:`${u?.username || delName}` });
    setDelOpen(false);
    setDelId(null);
    setDelName("");
    refresh();
    setMsg("Yetkili silindi ✅");
  }

  return (
    <div style={styles.listPanel}>
      {passModalOpen ? (
        <Modal title={`Şifre Değiştir: ${passTargetName}`} onClose={()=>setPassModalOpen(false)}>
          <div style={{ display:"grid", gap:10, minWidth:0 }}>
            <div style={styles.label}>Yeni Şifre</div>
            <input
              ref={newPassRef}
              style={styles.input}
              value={newPass}
              onChange={(e)=>setNewPass(e.target.value)}
              placeholder="örn: 5555"
              type="password"
            />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
              <button className="hoverable" style={styles.btnGhost} onClick={()=>setPassModalOpen(false)}>Vazgeç</button>
              <button className="hoverable" style={styles.btnPrimary} onClick={confirmPassChange}>Kaydet</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {delOpen ? (
        <Modal title="Silme Onayı" onClose={()=>setDelOpen(false)}>
          <div style={{ display:"grid", gap:12, minWidth:0 }}>
            <div style={styles.textWhite}>
              <b style={styles.textWhiteStrong}>{delName}</b> silinsin mi?
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
              <button className="hoverable" style={styles.btnGhost} onClick={()=>setDelOpen(false)}>Vazgeç</button>
              <button className="hoverable" style={styles.btnDanger} onClick={confirmDeleteUser}>Sil</button>
            </div>
          </div>
        </Modal>
      ) : null}

      <div style={styles.listPanelTitle}>
        Yetkili Yönetimi
        <button className="hoverable" style={styles.detailClose} onClick={onClose}>Kapat</button>
      </div>

      <div style={styles.formBox}>
        <div style={styles.formBoxTitle}>Yeni Yetkili Oluştur</div>

        <div className="hs-grid2" style={styles.grid2}>
          <FieldSmall label="Kullanıcı Adı" value={uName} onChange={setUName} placeholder="örn: admin2" />
          <FieldSmall label="Şifre" value={uPass} onChange={setUPass} placeholder="örn: 5555" type="password" />
        </div>

        <div style={{ display:"grid", gap:6, marginTop:10, minWidth:0 }}>
          <div style={styles.label}>Rol</div>
          <select style={styles.input} value={uRole} onChange={(e)=>setURole(e.target.value)}>
            <option value="admin">admin</option>
            <option value="owner">yönetici</option>
          </select>
        </div>

        {msg ? <div style={styles.msgInfo}>{msg}</div> : null}
        <button className="hoverable" style={styles.btnPrimary} onClick={createUser}>Kullanıcı Oluştur</button>
      </div>

      <div style={{ height:12 }} />

      <div style={{ display:"grid", gap:10, minWidth:0 }}>
        {users
          .slice()
          .sort((a,b)=> (b.createdAt||0) - (a.createdAt||0))
          .map((u)=>(
            <div key={u.id} style={styles.listRow}>
              <div style={{ ...styles.textWhiteStrong, overflowWrap:"anywhere" }}>
                {u.username} <span style={styles.logPill}>{u.role}</span>
              </div>
              <div style={styles.textMutedSmall}>Oluşturma: {u.createdAt ? fmtLogTime(u.createdAt) : "-"}</div>

              <div style={styles.listRowActions}>
                <button className="hoverable" style={styles.btnGhost} onClick={()=>openPassModal(u.id)}>Şifre Değiştir</button>
                <button className="hoverable" style={styles.btnDanger} onClick={()=>askDeleteUser(u.id)}>Sil</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/** Admin Panel */
function AdminLikePanel({ role, currentUsername }) {
  const isOwner = role === "owner";

  const [pitches, setPitches] = useState(() => load(LS_PITCHES, [
    { id:"p1", name:"Halı Saha 1" },
    { id:"p2", name:"Halı Saha 2" }
  ]));
  const [activePitchId, setActivePitchId] = useState(pitches?.[0]?.id || "p1");
  const [newPitchName, setNewPitchName] = useState("");

  const [monthDate, setMonthDate] = useState(() => isoToDate(todayISO()));
  const [selectedISO, setSelectedISO] = useState(todayISO());

  const [calendarOpen, setCalendarOpen] = useState(true);
  const [selectedFreeSlot, setSelectedFreeSlot] = useState(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [matchType, setMatchType] = useState("tek");
  const [info, setInfo] = useState("");

  const [selectedBusySlot, setSelectedBusySlot] = useState(null);
  const [selectedSlotBookings, setSelectedSlotBookings] = useState([]);

  const [showBlacklist, setShowBlacklist] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showCustomers, setShowCustomers] = useState(false);

  const [pitchMenu, setPitchMenu] = useState(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamePitchId, setRenamePitchId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePitchId, setDeletePitchId] = useState(null);
  const [deletePitchName, setDeletePitchName] = useState("");

  useEffect(() => { save(LS_PITCHES, pitches); }, [pitches]);

  useEffect(() => {
    function onDown(e) {
      if (!pitchMenu) return;
      const menuEl = document.getElementById("pitch-menu");
      if (menuEl && menuEl.contains(e.target)) return;
      setPitchMenu(null);
    }
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [pitchMenu]);

  const activePitch = useMemo(() => pitches.find(p=>p.id===activePitchId) || pitches[0], [pitches, activePitchId]);

  const [tick, setTick] = useState(0);
  const [bookingsAll, setBookingsAll] = useState([]);

useEffect(() => {
  const unsub = listenReservations((data) => {
    setBookingsAll(data);
  });
  return () => unsub();
}, []);

  const dayBookings = useMemo(() => {
    const physical = bookingsAll.filter((b) => b.pitchId === activePitchId && b.date === selectedISO);

    const virtualFromAbone = bookingsAll
      .filter((b) => b.pitchId === activePitchId && b.matchType === "abone")
      .filter((b) => {
        if (!sameWeekday(b.date, selectedISO)) return false;
        const startOk = selectedISO >= b.date;
        if (!startOk) return false;

        const ex = Array.isArray(b.aboneExceptions) ? b.aboneExceptions : [];
        if (ex.includes(selectedISO)) return false;

        const overlapExisting = physical.some(p => rangesOverlap(p.startTime, p.endTime, b.startTime, b.endTime));
        if (overlapExisting) return false;

        return true;
      })
      .map((b) => ({
        ...b,
        _virtual: true,
        _virtualForDate: selectedISO
      }));

    return [...physical, ...virtualFromAbone].sort((a,b)=> (a.startTime > b.startTime ? 1 : -1));
  }, [bookingsAll, activePitchId, selectedISO]);

  const monthBookingsCountMap = useMemo(() => {
    const map = new Map();
    for (const b of bookingsAll) {
      if (b.pitchId !== activePitchId) continue;
      map.set(b.date, (map.get(b.date) || 0) + 1);
    }
    return map;
  }, [bookingsAll, activePitchId]);

  function refresh() { setTick((x)=>x+1); }

  useEffect(() => {
    const phoneN = normalizePhone(phone);
    if (!phoneN) return;
    const c = findCustomerByPhone(phoneN);
    if (!c) return;
    setFirstName((v)=> (v ? v : (c.firstName || "")));
    setLastName((v)=> (v ? v : (c.lastName || "")));
    setNote((v)=> (v ? v : (c.note || "")));
  }, [phone]);

  function addPitchInline() {
    const name = (newPitchName || "").trim();
    if (!name) return;
    const id = "p" + Date.now();
    const next = [...pitches, { id, name }];
    setPitches(next);
    setActivePitchId(id);
    setNewPitchName("");
    setInfo("Yeni halısaha eklendi ✅");
    addLog({ action:"Halısaha eklendi", by: currentUsername, detail:`${name}` });
  }

  function openRenameModal(pitchId) {
    const p = pitches.find(x => x.id === pitchId);
    setRenamePitchId(pitchId);
    setRenameValue(p?.name || "");
    setRenameOpen(true);
    setTimeout(() => {
      try { renameInputRef.current?.focus(); renameInputRef.current?.select?.(); } catch {}
    }, 0);
  }

  function confirmRename() {
    const name = (renameValue || "").trim();
    if (!name) return;
    const p = pitches.find(x=>x.id===renamePitchId);
    setPitches(prev => prev.map(x => x.id===renamePitchId ? { ...x, name } : x));
    addLog({ action:"Halısaha adı değişti", by: currentUsername, detail:`${p?.name || "-"} → ${name}` });
    setInfo("İsim güncellendi ✅");
    setRenameOpen(false);
    setRenamePitchId(null);
  }

  function openDeleteConfirm(pitchId) {
    const p = pitches.find(x=>x.id===pitchId);
    setDeletePitchId(pitchId);
    setDeletePitchName(p?.name || "Halısaha");
    setDeleteOpen(true);
  }

  function confirmDeletePitch() {
    const pitchId = deletePitchId;
    const p = pitches.find(x=>x.id===pitchId);

    const nextP = pitches.filter(x => x.id !== pitchId);
    setPitches(nextP.length ? nextP : [{ id:"p1", name:"Halı Saha 1" }]);

    if (activePitchId === pitchId) {
      const fallbackId = nextP[0]?.id || "p1";
      setActivePitchId(fallbackId);
    }

    const nextB = load(LS_BOOKINGS, []).filter(b => b.pitchId !== pitchId);
    save(LS_BOOKINGS, nextB);

    addLog({ action:"Halısaha silindi", by: currentUsername, detail:`${p?.name || pitchId}` });
    setInfo("Halısaha silindi ✅");

    setDeleteOpen(false);
    setDeletePitchId(null);
    setDeletePitchName("");
    setPitchMenu(null);
    setTimeout(() => { try { document.activeElement?.blur?.(); } catch {} }, 0);

    refresh();
  }

  const slotPairs = useMemo(() => {
    const pairs = [];
    for (let i=0;i<TIME_POINTS.length-1;i++){
      pairs.push({ start: TIME_POINTS[i], end: TIME_POINTS[i+1], label: rangeLabel(TIME_POINTS[i], TIME_POINTS[i+1]) });
    }
    return pairs;
  }, []);

  function slotIsBusy(slot) {
    return dayBookings.some(b => rangesOverlap(slot.start, slot.end, b.startTime, b.endTime));
  }

  const freeSlots = useMemo(() => slotPairs.filter(s => !slotIsBusy(s)), [slotPairs, dayBookings]);

  const busySlotsWithInfo = useMemo(() => {
    return slotPairs
      .filter(s => slotIsBusy(s))
      .map(s => {
        const matches = dayBookings.filter(b => rangesOverlap(s.start, s.end, b.startTime, b.endTime));
        const b0 = matches[0];
        const name = b0 ? `${(b0.firstName||"").trim()} ${(b0.lastName||"").trim()}`.trim() : "";
        const noteMini = b0?.note ? b0.note : "";
        return { ...s, _miniName: name, _miniNote: noteMini, _matches: matches };
      });
  }, [slotPairs, dayBookings]);

  function handleFreeSlotClick(slot) {
    setSelectedBusySlot(null);
    setSelectedSlotBookings([]);
    setSelectedFreeSlot(slot);
    setInfo("");
  }

  function handleBusySlotClick(slotObj) {
    const slot = { start: slotObj.start, end: slotObj.end, label: slotObj.label };
    setSelectedFreeSlot(null);
    const matches = dayBookings.filter(b => rangesOverlap(slot.start, slot.end, b.startTime, b.endTime));
    setSelectedBusySlot(slot);
    setSelectedSlotBookings(matches);
  }

  useEffect(() => {
    setSelectedFreeSlot(null);
    setSelectedBusySlot(null);
    setSelectedSlotBookings([]);
  }, [selectedISO, activePitchId]);

  async function saveBooking() {
    setInfo("");
    if (!selectedFreeSlot) return setInfo("Önce boş saat seç.");

    const payload = {
      id: "b-" + Date.now(),
      pitchId: activePitchId,
      pitchName: activePitch?.name || "Halı Saha",
      date: selectedISO,
      startTime: selectedFreeSlot.start,
      endTime: selectedFreeSlot.end,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: normalizePhone(phone),
      note: note.trim(),
      matchType,
      noShow: false,
      source: role,
      createdBy: currentUsername,
      createdAt: Date.now(),
      aboneExceptions: matchType === "abone" ? [] : undefined
    };

    if (!payload.firstName || !payload.phone) return setInfo("Ad ve telefon zorunlu.");
    if (isBlacklisted(payload.phone)) return setInfo("Bu numara kara listede.");

    const overlapNow = dayBookings.some((b) => rangesOverlap(payload.startTime, payload.endTime, b.startTime, b.endTime));
    if (overlapNow) return setInfo("Bu saat dolu.");

    try {
      await createReservationSafe(payload);
    } catch (err) {
      setInfo(err.message || "Bu saat dolu.");
      return;
    }

    upsertCustomerFromBooking({
      phone: payload.phone,
      firstName: payload.firstName,
      lastName: payload.lastName,
      note: payload.note
    });

    const mt = MATCH_TYPES.find(x=>x.key===payload.matchType)?.label || payload.matchType;
    addLog({
      action: "Randevu oluşturuldu",
      by: currentUsername,
      detail: `${payload.pitchName} — ${payload.date} — ${payload.startTime}-${payload.endTime} — ${payload.firstName} ${payload.lastName} — ${formatPhoneTR(payload.phone)} — ${mt}`
    });

    setFirstName(""); setLastName(""); setPhone(""); setNote("");
    setMatchType("tek");
    setSelectedFreeSlot(null);
    setInfo("Kayıt alındı ✅");
    refresh();
  }

  function delBooking(id, bookingObj) {
    const b = bookingObj;
    if (!b) return;

    // Abone: bu haftayı iptal (exception ekle)
    if (b._virtual && b.matchType === "abone") {
      const dateToSkip = b._virtualForDate;
      const ex = Array.isArray(b.aboneExceptions) ? b.aboneExceptions : [];
      if (!ex.includes(dateToSkip)) {
        updateReservation(b.id, { aboneExceptions: [...ex, dateToSkip] });
      }
      setInfo("Bu haftalık abonelik iptal edildi ✅");
      setSelectedBusySlot(null);
      setSelectedSlotBookings([]);
      refresh();
      return;
    }

    // Normal silme
    deleteReservation(id);
    setInfo("Silindi ✅");
    setSelectedBusySlot(null);
    setSelectedSlotBookings([]);
    refresh();
  }
/*


    const next = list.filter(x => x.id !== id);
    save(LS_BOOKINGS, next);
    addLog({ action:"Randevu silindi", by: currentUsername, detail:`${b.pitchName} — ${b.date} — ${b.startTime}-${b.endTime} — ${b.firstName} ${b.lastName}` });
    setInfo("Silindi ✅");
    setSelectedBusySlot(null);
    setSelectedSlotBookings([]);
    refresh();
  }

*/

  function markNoShow(id, bookingObj) {
    const b = bookingObj;
    if (!b) return;

    if (b.matchType === "abone") {
      const dateToSkip = b._virtual ? b._virtualForDate : b.date;
      const ex = Array.isArray(b.aboneExceptions) ? b.aboneExceptions : [];
      if (!ex.includes(dateToSkip)) {
        updateReservation(b.id, { aboneExceptions: [...ex, dateToSkip] });
      }
      setInfo("Abone bu hafta iptal edildi ✅");
      refresh();
      return;
    }

    updateReservation(id, { noShow: true });
    setInfo("Gelmedi işaretlendi ✅");
    refresh();
  }
/*


    const next = list.map(x => x.id === id ? { ...x, noShow:true } : x);
    save(LS_BOOKINGS, next);
    addLog({ action:"Gelmedi işaretlendi", by: currentUsername, detail:`${b.pitchName} — ${b.date} — ${b.startTime}-${b.endTime} — ${b.firstName} ${b.lastName}` });
    setInfo("Gelmedi işaretlendi ✅");
    refresh();
  }

*/

  function aboneSkipNextWeek(masterId) {
    const master = bookingsAll.find(x => x.id === masterId);
    if (!master || master.matchType !== "abone") return;

    let target = selectedISO;
    if (!sameWeekday(master.date, target)) {
      let d = target;
      for (let i=0;i<14;i++){
        if (sameWeekday(master.date, d)) { target = d; break; }
        d = addDays(d, 1);
      }
    }
/*


    const ex = Array.isArray(master.aboneExceptions) ? master.aboneExceptions : [];
    if (!ex.includes(target)) {
      updateReservation(masterId, { aboneExceptions: [...ex, target] });
    }
    setInfo("Bu hafta abonelik boş bırakıldı ✅");
    refresh();
  }

*/
    }
/*


    const ex = Array.isArray(master.aboneExceptions) ? master.aboneExceptions : [];
    if (!ex.includes(target)) master.aboneExceptions = [...ex, target];
    save(LS_BOOKINGS, [...list]);

    addLog({ action:"Abone - bu hafta iptal", by: currentUsername, detail:`${master.pitchName} — ${target} — ${master.startTime}-${master.endTime} — ${master.firstName} ${master.lastName}` });
    setInfo("Bu hafta abonelik boş bırakıldı ✅");
    refresh();
  }

*/

  function addToBlacklistFromBooking(b) {
    const phoneN = normalizePhone(b.phone);
    if (!phoneN) return setInfo("Telefon yok, kara listeye alınamaz.");
    const bl = load(LS_BLACKLIST, []);
    if (bl.some(x => normalizePhone(x.phone) === phoneN)) return setInfo("Zaten kara listede.");

    const entry = {
      id:"bl-"+Date.now(),
      name:`${b.firstName||""} ${b.lastName||""}`.trim(),
      phone:phoneN,
      note:"Gelmedi / problemli",
      createdAt:Date.now()
    };
    bl.push(entry);
    save(LS_BLACKLIST, bl);

    addLog({ action:"Kara listeye alındı", by: currentUsername, detail:`${entry.name} — ${formatPhoneTR(entry.phone)}` });

    setInfo("Kara listeye alındı ✅");
    refresh();
  }

  const monthDays = useMemo(() => buildMonthDaysOnly(monthDate), [monthDate]);

  const menuPos = useMemo(() => {
    if (!pitchMenu?.rect) return null;
    const rect = pitchMenu.rect;
    const w = 210, h = 140;
    const pad = 10;
    let left = rect.right + 8;
    let top = rect.top;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (left + w > vw - pad) left = rect.left - w - 8;
    if (top + h > vh - pad) top = vh - h - pad;
    if (top < pad) top = pad;
    if (left < pad) left = pad;
    return { left, top };
  }, [pitchMenu]);

  const matchMeta = MATCH_TYPES.find(x => x.key === matchType) || MATCH_TYPES[0];

  return (
    <div style={{ display:"grid", gap:14, position:"relative", animation:"panelIn .22s ease both", minWidth:0 }}>
      {renameOpen ? (
        <Modal title="Halısaha İsmi Değiştir" onClose={()=>setRenameOpen(false)}>
          <div style={{ display:"grid", gap:10, minWidth:0 }}>
            <div style={styles.label}>Yeni İsim</div>
            <input
              ref={renameInputRef}
              style={styles.input}
              value={renameValue}
              onChange={(e)=>setRenameValue(e.target.value)}
              placeholder="örn: Halısaha 3"
            />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
              <button className="hoverable" style={styles.btnGhost} onClick={()=>setRenameOpen(false)}>Vazgeç</button>
              <button className="hoverable" style={styles.btnPrimary} onClick={confirmRename}>Kaydet</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {deleteOpen ? (
        <Modal title="Silme Onayı" onClose={()=>setDeleteOpen(false)}>
          <div style={{ display:"grid", gap:12, minWidth:0 }}>
            <div style={styles.textWhite}>
              <b style={styles.textWhiteStrong}>{deletePitchName}</b> silinsin mi?
              <div style={styles.textMutedSmall}>Bu halısahanın randevuları da silinir.</div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
              <button className="hoverable" style={styles.btnGhost} onClick={()=>setDeleteOpen(false)}>Vazgeç</button>
              <button className="hoverable" style={styles.btnDanger} onClick={confirmDeletePitch}>Sil</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {pitchMenu && menuPos ? (
        <div
          id="pitch-menu"
          style={{ ...styles.ctxMenu, left: menuPos.left, top: menuPos.top }}
          onMouseDown={(e)=>e.stopPropagation()}
          onClick={(e)=>e.stopPropagation()}
        >
          <button
            className="hoverable"
            style={styles.menuItem}
            onClick={() => {
              const pid = pitchMenu.pitchId;
              setPitchMenu(null);
              setTimeout(() => openRenameModal(pid), 0);
            }}
          >
            İsmi Değiştir
          </button>

          <button
            className="hoverable"
            style={{ ...styles.menuItem, ...styles.menuDanger }}
            onClick={() => {
              const pid = pitchMenu.pitchId;
              setPitchMenu(null);
              setTimeout(() => openDeleteConfirm(pid), 0);
            }}
          >
            Sil
          </button>

          <button
            className="hoverable"
            style={{ ...styles.menuItem, marginBottom:0, opacity:0.92 }}
            onClick={() => setPitchMenu(null)}
          >
            Kapat
          </button>
        </div>
      ) : null}

      <div style={{ minWidth:0 }}>
        <div style={styles.panelTitle}>{isOwner ? "Yönetici Paneli" : "Admin Panel"}</div>
      </div>

      <div style={styles.pitchRow}>
        {pitches.map((p, idx) => (
          <button
            key={p.id}
            className="hoverable"
            style={{ ...styles.pitchBtn, ...(p.id === activePitchId ? styles.pitchBtnActive : {}), minWidth:0 }}
            onClick={() => setActivePitchId(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setPitchMenu({ pitchId: p.id, rect });
            }}
            title="Sağ tık: menü"
          >
            {idx+1}. {p.name}
          </button>
        ))}

        <div style={styles.pitchAddBox}>
          <input
            style={styles.pitchAddInput}
            value={newPitchName}
            onChange={(e)=>setNewPitchName(e.target.value)}
            placeholder="Yeni halısaha adı"
          />
          <button className="hoverable" style={styles.pitchBtnAdd} onClick={addPitchInline}>+ Ekle</button>
        </div>
      </div>

      <div style={styles.topActionsRow}>
        <button className="hoverable" style={styles.topActionBtn} onClick={() => { setShowBlacklist(true); setShowUsers(false); setShowLogs(false); setShowCustomers(false); }}>
          Kara Liste
        </button>

        <button className="hoverable" style={styles.topActionBtn} onClick={() => { setShowCustomers(true); setShowBlacklist(false); setShowUsers(false); setShowLogs(false); }}>
          Müşteri Kayıtları
        </button>

        {isOwner ? (
          <button className="hoverable" style={styles.topActionBtn} onClick={() => { setShowLogs(true); setShowBlacklist(false); setShowUsers(false); setShowCustomers(false); }}>
            Loglar
          </button>
        ) : null}

        {isOwner ? (
          <button className="hoverable" style={styles.topActionBtnLive} onClick={() => { setShowUsers(true); setShowBlacklist(false); setShowLogs(false); setShowCustomers(false); }}>
            Yetkili Yönetimi
          </button>
        ) : null}

        <button className="hoverable" style={styles.topActionBtnGhost} onClick={() => { setShowBlacklist(false); setShowUsers(false); setShowLogs(false); setShowCustomers(false); }}>
          Kapat
        </button>
      </div>

      {showCustomers ? <CustomerPanel onClose={() => setShowCustomers(false)} /> : null}
      {showBlacklist ? <BlacklistPanel currentUsername={currentUsername} onClose={() => setShowBlacklist(false)} /> : null}
      {showUsers ? <UserManagement currentUsername={currentUsername} onClose={() => setShowUsers(false)} /> : null}
      {showLogs && isOwner ? <LogsPanel onClose={() => setShowLogs(false)} /> : null}

      {info ? <div style={styles.msgInfo}>{info}</div> : null}

      {/* ✅ className ekledim: mobilde tek kolona düşecek */}
      <div className="hs-gridAdmin2" style={styles.gridAdmin2}>
        <div style={styles.blockInner}>
          <div style={styles.blockInnerTop}>
            <div style={styles.blockInnerTitle}>Tarih</div>
            <button className="hoverable" style={styles.smallToggleBtn} onClick={() => setCalendarOpen((v)=>!v)}>
              {calendarOpen ? "Kapat" : "Aç"}
            </button>
          </div>

          {calendarOpen ? (
            <div style={{ animation:"fadeSlide .22s ease both" }}>
              <div style={styles.monthHead}>
                <button className="hoverable" style={styles.iconBtn} onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth()-1, 1))}>‹</button>
                <div style={styles.monthTitle}>{monthLabelTR(monthDate)}</div>
                <button className="hoverable" style={styles.iconBtn} onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 1))}>›</button>
              </div>

              <div className="hs-grid2" style={styles.monthPickRow}>
                <select
                  style={styles.input}
                  value={monthDate.getMonth()}
                  onChange={(e) => setMonthDate(new Date(monthDate.getFullYear(), Number(e.target.value), 1))}
                >
                  {["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"].map((m,i)=>(
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  style={styles.input}
                  value={monthDate.getFullYear()}
                  onChange={(e) => setMonthDate(new Date(Number(e.target.value), monthDate.getMonth(), 1))}
                >
                  {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 2 + i).map((y)=>(
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div style={styles.weekHeaderSoft}>
                {Array.from({ length: 7 }, (_, i) => <div key={i} style={styles.weekCellSoft}>{trWeekdayShort(i)}</div>)}
              </div>

              <div style={styles.gridCalendarSoft}>
                {monthDays.map((cell) => {
                  const count = monthBookingsCountMap.get(cell.iso) || 0;
                  const active = cell.iso === selectedISO;
                  return (
                    <button
                      key={cell.iso}
                      className="hoverable"
                      onClick={() => setSelectedISO(cell.iso)}
                      style={{ ...styles.daySoft, ...(active ? styles.daySoftActive : {}) }}
                      title={cell.iso}
                    >
                      <div style={{ display:"flex", justifyContent:"space-between", width:"100%", alignItems:"center" }}>
                        <div style={{ fontWeight:900, fontSize:12 }}>{cell.day}</div>
                        {count > 0 ? <div style={styles.countPill}>{count}</div> : <div style={{ width:18 }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={styles.calendarClosedHint}>Takvimi açıp gün seçebilirsin.</div>
          )}
        </div>

        <div style={styles.blockInner}>
          <div style={{ ...styles.blockInnerTitle, overflowWrap:"anywhere" }}>
            {activePitch?.name} — {selectedISO}
          </div>

          {selectedFreeSlot ? (
            <div style={{ ...styles.formBox, animation:"popIn .20s ease both" }}>
              <div style={styles.formBoxTitle}>
                Seçili Boş Saat: <b style={styles.textWhiteStrong}>{selectedFreeSlot.label}</b>
                <button className="hoverable" style={styles.detailClose} onClick={() => setSelectedFreeSlot(null)}>Kapat</button>
              </div>

              <div className="hs-grid2" style={styles.grid2}>
                <FieldSmall label="Ad" value={firstName} onChange={setFirstName} placeholder="ör: Mehmet" />
                <FieldSmall label="Soyad" value={lastName} onChange={setLastName} placeholder="ör: Yılmaz" />
              </div>

              <FieldSmall label="Telefon" value={phone} onChange={setPhone} placeholder="05xxxxxxxxx" />

              <div style={{ display:"grid", gap:6, marginTop:10, minWidth:0 }}>
                <div style={styles.label}>Maç Tipi</div>

                <select
                  style={styles.selectStrong}
                  value={matchType}
                  onChange={(e)=>setMatchType(e.target.value)}
                >
                  {MATCH_TYPES.map(t => (
                    <option
                      key={t.key}
                      value={t.key}
                      style={{ background: "rgba(20,22,30,0.98)", color: t.color, fontWeight: 900 }}
                    >
                      {t.label}
                    </option>
                  ))}
                </select>

                <div style={{
                  marginTop:8,
                  display:"inline-flex",
                  alignItems:"center",
                  padding:"6px 10px",
                  borderRadius:999,
                  border:"1px solid rgba(255,255,255,0.20)",
                  background: matchMeta.bg,
                  color: matchMeta.color,
                  fontWeight:950,
                  fontSize:12
                }}>
                  Seçili: {matchMeta.label}
                </div>
              </div>

              <FieldSmall label="Not (opsiyonel)" value={note} onChange={setNote} placeholder="" />
              <button className="hoverable" style={styles.btnPrimary} onClick={saveBooking}>Kaydet</button>
            </div>
          ) : (
            <div style={{ ...styles.msgInfo, animation:"fadeSlide .18s ease both" }}>
              Kayıt eklemek için <b>Boş Saatler</b> listesinden bir saate tıkla.
            </div>
          )}

          <div style={{ height:12 }} />

          {/* ✅ className ekledim: mobilde tek kolona düşecek */}
          <div className="hs-bottomGrid" style={styles.bottomGrid}>
            <div style={styles.miniBox}>
              <div style={styles.miniTitle}>Boş Saatler (tıkla)</div>
              <div style={styles.miniList}>
                {freeSlots.map((s)=>(
                  <button
                    key={s.label}
                    className="hoverable"
                    style={{ ...styles.slotRowFreeBtn, ...(selectedFreeSlot?.label === s.label ? styles.slotRowFreeBtnActive : {}) }}
                    onClick={() => handleFreeSlotClick(s)}
                  >
                    {s.label}
                  </button>
                ))}
                {freeSlots.length === 0 ? <div style={styles.empty}>Boş yok</div> : null}
              </div>
            </div>

            <div style={styles.miniBox}>
              <div style={styles.miniTitle}>Dolu Saatler</div>
              <div style={styles.miniList}>
                {busySlotsWithInfo.map((s)=>(
                  <button
                    key={s.label}
                    className="hoverable"
                    style={{ ...styles.slotRowBusyBtn, ...(selectedBusySlot?.label === s.label ? styles.slotRowBusyBtnActive : {}) }}
                    onClick={() => handleBusySlotClick(s)}
                  >
                    <div style={{ display:"grid", gap:2, minWidth:0 }}>
                      <div style={{ fontWeight:950 }}>{s.label}</div>
                      {(s._miniName || s._miniNote) ? (
                        <div style={styles.slotMiniText}>
                          {s._miniName ? <span style={{ fontWeight:950 }}>{s._miniName}</span> : null}
                          {s._miniNote ? <span style={{ opacity:0.92 }}>{" — "}{s._miniNote}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
                {busySlotsWithInfo.length === 0 ? <div style={styles.empty}>Dolu yok</div> : null}
              </div>
            </div>
          </div>

          {selectedBusySlot ? (
            <div style={{ ...styles.detailBox, animation:"fadeSlide .20s ease both" }}>
              <div style={styles.detailTitle}>
                <span style={styles.textWhiteStrong}>{selectedBusySlot.label}</span>
                <button className="hoverable" style={styles.detailClose} onClick={()=>{ setSelectedBusySlot(null); setSelectedSlotBookings([]); }}>Kapat</button>
              </div>

              <div style={{ display:"grid", gap:10, minWidth:0 }}>
                {selectedSlotBookings.map((b) => {
                  const who = (b.source === "admin")
                    ? `Admin: ${b.createdBy || "Admin"}`
                    : `Yönetici: ${b.createdBy || "Yönetici"}`;
                  const mt = MATCH_TYPES.find(x=>x.key===b.matchType)?.label || b.matchType || "-";
                  const shownDate = b._virtual ? b._virtualForDate : b.date;

                  return (
                    <div key={(b._virtual ? shownDate+"-" : "") + b.id} style={styles.detailCard}>
                      <div style={styles.detailCardTop}>
                        <div style={{ ...styles.textWhiteStrong, overflowWrap:"anywhere" }}>
                          {(b.firstName || "") + " " + (b.lastName || "")}
                          {b.matchType === "abone" ? <span style={styles.abonePill}>ABONE</span> : null}
                        </div>
                        <div style={styles.detailMetaPill}>{who}</div>
                      </div>

                      <div style={styles.detailGrid}>
                        <div style={styles.detailLabel}>Tarih</div>
                        <div style={{ ...styles.detailValue, overflowWrap:"anywhere" }}>{shownDate} — {b.startTime}-{b.endTime}</div>

                        <div style={styles.detailLabel}>Telefon</div>
                        <div style={{ ...styles.detailValue, overflowWrap:"anywhere" }}>{formatPhoneTR(b.phone || "")}</div>

                        <div style={styles.detailLabel}>Maç Tipi</div>
                        <div style={{ ...styles.detailValue, overflowWrap:"anywhere" }}>{mt}</div>

                        <div style={styles.detailLabel}>Not</div>
                        <div style={{ ...styles.detailValue, overflowWrap:"anywhere" }}>{b.note ? b.note : "-"}</div>
                      </div>

                      <div style={styles.detailActions}>
                        <button className="hoverable" style={styles.btnDanger} onClick={()=>delBooking(b.id, b)}>Sil</button>
                        <button className="hoverable" style={styles.btnGhost} onClick={()=>markNoShow(b.id, b)}>Gelmedi</button>
                        <button className="hoverable" style={styles.btnGhost} onClick={()=>addToBlacklistFromBooking(b)}>Kara Liste</button>

                        {b.matchType === "abone" ? (
                          <button className="hoverable" style={styles.btnGhost} onClick={()=>aboneSkipNextWeek(b.id)}>
                            Bu Hafta İptal
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {selectedSlotBookings.length === 0 ? (
                  <div style={styles.empty}>Bu slot için kayıt bulunamadı.</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Styles */
const styles = {
  pageWrap: {
    position:"relative",
    minHeight:"100vh",
    overflow:"hidden",
    background:
      "radial-gradient(900px 700px at 12% 10%, rgba(80,170,255,0.72) 0%, rgba(75,120,210,0.40) 44%, rgba(10,12,18,0.88) 82%) , " +
      "radial-gradient(900px 700px at 88% 90%, rgba(255,140,210,0.56) 0%, rgba(180,120,255,0.30) 46%, rgba(10,12,18,0.88) 84%)"
  },

  logoBg: {
    position:"absolute",
    inset:0,
    pointerEvents:"none",
    zIndex: 0,
    backgroundPosition:"center",
    backgroundRepeat:"no-repeat",
    backgroundSize:"min(860px, 74vw)",
    opacity: 0.18,
    filter:"contrast(1.10) saturate(1.15)",
    mixBlendMode:"screen"
  },

  particlesWrap: { position:"absolute", inset:0, pointerEvents:"none", zIndex: 1 },
  particle: {
    position:"absolute",
    bottom:"-20px",
    borderRadius: 999,
    background:"rgba(255,255,255,0.92)",
    animationName:"floatUp",
    animationTimingFunction:"linear",
    animationIterationCount:"infinite",
  },

  page: {
    minHeight:"100vh",
    display:"flex",
    alignItems:"center",
    justifyContent:"center",
    padding:"clamp(14px, 2.6vw, 28px)",
    fontFamily:'"Poppins", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
    maxWidth:"100%",
    overflowX:"hidden"
  },

  shell: { width:"min(1240px, 96vw)", position:"relative", zIndex: 2, margin:"0 auto", maxWidth:"100%" },

  topbar: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, gap:10, flexWrap:"wrap" },
  brandLeft: { display:"flex", alignItems:"center", gap:10 },
  logoDot: { width:14, height:14, borderRadius:999, background:"linear-gradient(135deg, #48ffa8, #5bd6ff, #a07bff)" },

  badge: {
    display:"inline-flex",
    alignItems:"center",
    padding:"6px 10px",
    borderRadius:999,
    background:"rgba(255,255,255,0.16)",
    color:"#fff",
    fontWeight:900,
    fontSize:12,
    border:"1px solid rgba(255,255,255,0.22)"
  },
  badgeSoft: {
    padding:"10px 12px",
    borderRadius:12,
    color:"rgba(255,255,255,0.94)",
    background:"rgba(255,255,255,0.12)",
    border:"1px solid rgba(255,255,255,0.18)",
    fontWeight:900
  },

  userBox: { display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" },
  userLine: { display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" },
  userName: { color:"#fff", fontWeight:950 },

  card: {
    position:"relative",
    background:"rgba(255,255,255,0.10)",
    border:"1px solid rgba(255,255,255,0.18)",
    borderRadius:18,
    padding:18,
    boxShadow:"0 12px 44px rgba(0,0,0,0.34)",
    backdropFilter:"blur(12px)",
    overflow:"hidden",
    maxWidth:"100%"
  },

  authWrap: { display:"flex", justifyContent:"center", alignItems:"center", minHeight:420 },
  authInner: { position:"relative", width:520, maxWidth:"92vw", display:"grid", gap:10 },

  loginBigWatermark: {
    position:"absolute",
    inset: 0,
    display:"flex",
    alignItems:"center",
    justifyContent:"center",
    pointerEvents:"none",
    zIndex: 0,
    opacity: 0.18
  },
  loginBigAgena: {
    fontSize: 112,
    fontWeight: 900,
    letterSpacing: 14,
    color:"rgba(255,255,255,0.92)",
    textTransform:"uppercase",
    lineHeight: 1,
    width:"100%",
    textAlign:"center",
    whiteSpace:"nowrap",
    transform:"scaleX(1.18)",
    filter:"blur(0.2px)"
  },

  authBrand: { textAlign:"center", color:"#fff", fontWeight:950, fontSize:28, letterSpacing:0.3, zIndex: 2 },
  authTitle: { color:"rgba(255,255,255,0.95)", fontWeight:950, fontSize:18, textAlign:"center", zIndex:2 },
  formWide: { display:"grid", gap:12, marginTop:10, zIndex:2 },

  passRow: { display:"flex", gap:10, alignItems:"center", minWidth:0 },
  passBtn: {
    width: 54, height: 42,
    borderRadius: 12,
    border:"1px solid rgba(255,255,255,0.22)",
    background:"rgba(0,0,0,0.18)",
    color:"#fff",
    fontWeight:900,
    cursor:"pointer",
    flex:"0 0 auto"
  },

  rememberRow: { display:"flex", alignItems:"center", gap:10, color:"rgba(255,255,255,0.92)", fontWeight:900, fontSize:12 },
  rememberText: { userSelect:"none" },

  label: { color:"rgba(255,255,255,0.92)", fontSize:12, fontWeight:950 },
  input: {
    padding:"12px 14px",
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.22)",
    outline:"none",
    background:"rgba(0,0,0,0.18)",
    color:"#fff",
    fontSize:14,
    width:"100%",
    minWidth:0
  },
  inputSmall: {
    padding:"11px 12px",
    borderRadius:12,
    border:"1px solid rgba(255,255,255,0.22)",
    outline:"none",
    background:"rgba(0,0,0,0.18)",
    color:"#fff",
    fontSize:13,
    width:"100%",
    minWidth:0
  },

  selectStrong: {
    padding:"12px 14px",
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.38)",
    outline:"none",
    background:"rgba(10,12,18,0.55)",
    color:"#ffffff",
    fontSize:14,
    fontWeight:950,
    boxShadow:"0 10px 24px rgba(0,0,0,0.20)",
    width:"100%",
    minWidth:0
  },

  btnPrimary: {
    padding:"14px 14px",
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.26)",
    background:"linear-gradient(135deg, rgba(80,170,255,0.32), rgba(255,140,210,0.18))",
    color:"#fff",
    fontWeight:950,
    fontSize:14,
    cursor:"pointer",
    width:"100%"
  },
  btnGhost: {
    padding:"10px 12px",
    borderRadius:12,
    border:"1px solid rgba(255,255,255,0.22)",
    background:"rgba(0,0,0,0.16)",
    color:"#fff",
    fontWeight:900,
    cursor:"pointer"
  },
  btnDanger: {
    padding:"10px 12px",
    borderRadius:12,
    border:"1px solid rgba(255,120,120,0.30)",
    background:"rgba(255,120,120,0.12)",
    color:"#ffe0e0",
    fontWeight:950,
    cursor:"pointer"
  },

  msgWarn: {
    padding:"12px 12px",
    borderRadius:14,
    background:"rgba(255, 199, 0, 0.12)",
    border:"1px solid rgba(255, 199, 0, 0.26)",
    color:"#ffe7a3",
    fontWeight:900,
    overflowWrap:"anywhere"
  },
  msgInfo: {
    padding:"12px 12px",
    borderRadius:14,
    background:"rgba(80,170,255,0.14)",
    border:"1px solid rgba(80,170,255,0.22)",
    color:"#eef8ff",
    fontWeight:900,
    overflowWrap:"anywhere"
  },

  panelTitle: { color:"#fff", fontWeight:950, fontSize:18 },

  pitchRow: { display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", minWidth:0 },
  pitchBtn: {
    minWidth: 190,
    padding:"14px 12px",
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.18)",
    background:"rgba(0,0,0,0.16)",
    color:"rgba(255,255,255,0.94)",
    fontWeight:950,
    cursor:"pointer",
    maxWidth:"100%"
  },
  pitchBtnActive: {
    background:"linear-gradient(135deg, rgba(80,170,255,0.22), rgba(255,140,210,0.14))",
    color:"#fff",
    borderColor:"rgba(255,255,255,0.30)"
  },
  pitchAddBox: { display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", minWidth:0, width:"100%" },
  pitchAddInput: {
    padding:"14px 12px",
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.22)",
    outline:"none",
    background:"rgba(0,0,0,0.16)",
    color:"#fff",
    fontSize:13,
    minWidth:220,
    flex:"1 1 220px",
    maxWidth:"100%"
  },
  pitchBtnAdd: {
    padding:"14px 12px",
    borderRadius:14,
    border:"1px dashed rgba(255,255,255,0.28)",
    background:"rgba(255,255,255,0.10)",
    color:"#fff",
    fontWeight:950,
    cursor:"pointer",
    flex:"0 0 auto"
  },

  topActionsRow: { display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" },
  topActionBtn: {
    padding:"12px 12px",
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.22)",
    background:"rgba(255,255,255,0.10)",
    color:"#fff",
    fontWeight:950,
    cursor:"pointer"
  },
  topActionBtnLive: {
    padding:"12px 12px",
    borderRadius:14,
    border:"1px solid rgba(72,255,168,0.26)",
    background:"rgba(72,255,168,0.10)",
    color:"#eafff4",
    fontWeight:950,
    cursor:"pointer"
  },
  topActionBtnGhost: {
    padding:"12px 12px",
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.18)",
    background:"rgba(0,0,0,0.14)",
    color:"#fff",
    fontWeight:950,
    cursor:"pointer"
  },

  listPanel: {
    borderRadius:18,
    border:"1px solid rgba(255,255,255,0.18)",
    background:"rgba(0,0,0,0.14)",
    padding:14,
    maxWidth:"100%",
    minWidth:0
  },
  listPanelTitle: {
    color:"#fff",
    fontWeight:950,
    marginBottom:10,
    display:"flex",
    alignItems:"center",
    justifyContent:"space-between",
    gap:10,
    flexWrap:"wrap"
  },
  listRow: {
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.16)",
    background:"rgba(0,0,0,0.14)",
    padding:12,
    display:"grid",
    gap:6,
    minWidth:0
  },
  listRowActions: {
    display:"flex",
    gap:10,
    justifyContent:"flex-end",
    marginTop: 6,
    flexWrap:"wrap"
  },

  gridAdmin2: { display:"grid", gridTemplateColumns:"1fr 1.2fr", gap:12, minWidth:0 },
  grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, minWidth:0 },

  blockInner: {
    borderRadius:18,
    border:"1px solid rgba(255,255,255,0.16)",
    background:"rgba(0,0,0,0.14)",
    padding:14,
    minWidth:0,
    maxWidth:"100%"
  },
  blockInnerTitle: { color:"#fff", fontWeight:950, marginBottom:10 },

  blockInnerTop: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" },
  smallToggleBtn: {
    padding:"8px 10px",
    borderRadius:12,
    border:"1px solid rgba(255,255,255,0.20)",
    background:"rgba(255,255,255,0.10)",
    color:"#fff",
    fontWeight:900,
    cursor:"pointer"
  },
  calendarClosedHint: {
    marginTop:10,
    padding:10,
    borderRadius:14,
    border:"1px dashed rgba(255,255,255,0.22)",
    background:"rgba(255,255,255,0.08)",
    color:"rgba(255,255,255,0.90)",
    fontWeight:900
  },

  monthHead: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginTop:8 },
  monthTitle: { color:"#fff", fontWeight:950 },
  iconBtn: {
    width:42, height:42,
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.20)",
    background:"rgba(0,0,0,0.14)",
    color:"#fff",
    fontSize:18,
    cursor:"pointer"
  },
  monthPickRow: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10, minWidth:0 },

  weekHeaderSoft: { display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:8, marginTop:12, minWidth:0 },
  weekCellSoft: {
    color:"rgba(255,255,255,0.88)",
    fontSize:12,
    fontWeight:900,
    textAlign:"center",
    padding:"6px 0",
    borderRadius:10,
    background:"rgba(255,255,255,0.06)",
    border:"1px solid rgba(255,255,255,0.10)"
  },

  gridCalendarSoft: { display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:8, marginTop:10, minWidth:0 },

  daySoft: {
    height:44,
    borderRadius:14,
    border:"1px solid rgba(255,255,255,0.16)",
    background:"rgba(255,255,255,0.08)",
    color:"#fff",
    padding:"10px 10px",
    cursor:"pointer",
    display:"flex",
    alignItems:"center",
    justifyContent:"center"
  },
  daySoftActive: {
    background:"linear-gradient(135deg, rgba(80,170,255,0.20), rgba(255,140,210,0.14))",
    borderColor:"rgba(255,255,255,0.28)"
  },
  countPill: {
    minWidth:18,
    height:16,
    borderRadius:999,
    background:"rgba(255,255,255,0.16)",
    border:"1px solid rgba(255,255,255,0.22)",
    fontSize:11,
    display:"inline-flex",
    alignItems:"center",
    justifyContent:"center",
    color:"#fff"
  },

  formBox: {
    borderRadius:16,
    border:"1px solid rgba(255,255,255,0.16)",
    background:"rgba(255,255,255,0.10)",
    padding:12,
    minWidth:0
  },
  formBoxTitle: {
    display:"flex",
    alignItems:"center",
    justifyContent:"space-between",
    color:"#fff",
    fontWeight:950,
    marginBottom:10,
    gap:10,
    flexWrap:"wrap"
  },

  bottomGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, minWidth:0 },
  miniBox: {
    borderRadius:16,
    border:"1px solid rgba(255,255,255,0.14)",
    background:"rgba(0,0,0,0.12)",
    padding:12,
    minWidth:0
  },
  miniTitle: { color:"#fff", fontWeight:950, marginBottom:8, fontSize:13 },
  miniList: { display:"grid", gap:6, maxHeight:170, overflow:"auto", paddingRight:6, minWidth:0 },

  slotRowFreeBtn: {
    width:"100%",
    textAlign:"left",
    padding:"8px 10px",
    borderRadius:12,
    border:"1px solid rgba(72,255,168,0.24)",
    background:"rgba(72,255,168,0.10)",
    color:"#ffffff",
    fontWeight:900,
    fontSize:12,
    cursor:"pointer",
    overflowWrap:"anywhere"
  },
  slotRowFreeBtnActive: {
    background:"rgba(72,255,168,0.16)",
    borderColor:"rgba(160,255,220,0.30)"
  },

  slotRowBusyBtn: {
    width:"100%",
    textAlign:"left",
    padding:"8px 10px",
    borderRadius:12,
    border:"1px solid rgba(255,120,120,0.22)",
    background:"rgba(255,120,120,0.10)",
    color:"#ffffff",
    fontWeight:900,
    fontSize:12,
    cursor:"pointer",
    overflowWrap:"anywhere"
  },
  slotRowBusyBtnActive: {
    background:"rgba(255,120,120,0.16)",
    borderColor:"rgba(255,190,190,0.30)"
  },
  slotMiniText: {
    marginTop: 2,
    fontSize: 11,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 1.25,
    overflowWrap:"anywhere"
  },

  detailBox: {
    marginTop:12,
    borderRadius:16,
    border:"1px solid rgba(255,255,255,0.16)",
    background:"rgba(255,255,255,0.10)",
    padding:12,
    minWidth:0
  },
  detailTitle: {
    display:"flex",
    alignItems:"center",
    justifyContent:"space-between",
    color:"#fff",
    fontWeight:950,
    marginBottom:10,
    gap:10,
    flexWrap:"wrap"
  },
  detailClose: {
    padding:"8px 10px",
    borderRadius:12,
    border:"1px solid rgba(255,255,255,0.20)",
    background:"rgba(0,0,0,0.14)",
    color:"#fff",
    fontWeight:900,
    cursor:"pointer"
  },

  detailCard: {
    borderRadius:16,
    border:"1px solid rgba(255,255,255,0.16)",
    background:"rgba(0,0,0,0.14)",
    padding:12,
    color:"#fff",
    display:"grid",
    gap:10,
    minWidth:0
  },
  detailCardTop: {
    display:"flex",
    alignItems:"center",
    justifyContent:"space-between",
    gap:10,
    flexWrap:"wrap"
  },
  detailMetaPill: {
    padding:"6px 10px",
    borderRadius:999,
    border:"1px solid rgba(255,255,255,0.20)",
    background:"rgba(255,255,255,0.12)",
    color:"#fff",
    fontWeight:950,
    fontSize:12
  },
  detailGrid: {
    display:"grid",
    gridTemplateColumns:"110px 1fr",
    gap:8,
    alignItems:"center",
    minWidth:0
  },
  detailLabel: { color:"rgba(255,255,255,0.82)", fontWeight:900, fontSize:12 },
  detailValue: { color:"#fff", fontWeight:900, fontSize:13 },

  detailActions: { display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" },

  abonePill: {
    marginLeft:10,
    padding:"4px 8px",
    borderRadius:999,
    border:"1px solid rgba(120,210,255,0.26)",
    background:"rgba(120,210,255,0.12)",
    color:"#eaf8ff",
    fontSize:11,
    fontWeight:950
  },

  textWhiteStrong: { color:"#fff", fontWeight:950 },
  textWhite: { color:"rgba(255,255,255,0.94)", fontWeight:800 },
  textMutedSmall: { color:"rgba(255,255,255,0.80)", fontSize:12, fontWeight:800 },

  logPill: {
    marginLeft:8,
    padding:"4px 8px",
    borderRadius:999,
    border:"1px solid rgba(255,255,255,0.22)",
    background:"rgba(0,0,0,0.16)",
    color:"#fff",
    fontSize:11,
    fontWeight:950
  },

  empty: { padding:10, color:"rgba(255,255,255,0.86)", fontWeight:900 },

  ctxMenu: {
    position:"fixed",
    zIndex: 9999,
    width: 210,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(14,16,22,0.84)",
    backdropFilter: "blur(14px)",
    boxShadow: "0 18px 55px rgba(0,0,0,0.45)",
    padding: 8
  },
  menuItem: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.10)",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
    marginBottom: 8
  },
  menuDanger: {
    border: "1px solid rgba(255,120,120,0.26)",
    background: "rgba(255,120,120,0.10)",
    color: "#ffe0e0"
  },

  modalOverlay: {
    position:"fixed",
    inset:0,
    zIndex: 10000,
    background:"rgba(0,0,0,0.44)",
    display:"flex",
    alignItems:"center",
    justifyContent:"center",
    padding: 18
  },
  modalCard: {
    width: 520,
    maxWidth:"94vw",
    borderRadius: 18,
    border:"1px solid rgba(255,255,255,0.18)",
    background:"rgba(16,18,26,0.84)",
    backdropFilter:"blur(16px)",
    boxShadow:"0 22px 70px rgba(0,0,0,0.45)",
    padding: 14
  },
  modalTop: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:10, flexWrap:"wrap" },
  modalTitle: { color:"#fff", fontWeight:950 },
  modalClose: {
    padding:"8px 10px",
    borderRadius:12,
    border:"1px solid rgba(255,255,255,0.20)",
    background:"rgba(0,0,0,0.14)",
    color:"#fff",
    fontWeight:900,
    cursor:"pointer"
  }
};
