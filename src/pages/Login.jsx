import React from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const go = (role) => { login(role); nav(role === "admin" ? "/admin" : "/customer"); };
  return (
    <div style={{ padding: 50, textAlign: "center" }}>
      <h1>Giriş</h1>
      <button onClick={() => go("admin")} style={{ marginRight: 20 }}>Admin Girişi</button>
      <button onClick={() => go("customer")}>Müşteri Girişi</button>
    </div>
  );
}
