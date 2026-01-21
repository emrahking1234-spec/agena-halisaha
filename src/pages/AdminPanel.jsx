import React from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function AdminPanel() {
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <div style={{ padding: 50, textAlign: "center" }}>
      <h1>Admin Panel</h1>
      <p>Buraya admin içerikleri gelecek.</p>
      <button onClick={() => { logout(); nav("/"); }}>Çıkış Yap</button>
    </div>
  );
}
