"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OwnerGate({ configured }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/owner/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "No se pudo abrir la sesión.");
        return;
      }
      setPassword("");
      router.refresh();
    } catch {
      setError("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ownerGate">
      <div>
        <span className="eyebrow">OWNER GATE</span>
        <h1>{configured ? "Acceso de propietario requerido" : "Owner gate pendiente de configurar"}</h1>
        <p>
          {configured
            ? "Las acciones que pueden consumir créditos o escribir handoffs están protegidas. Introduce tu contraseña personal para abrir una sesión de 12 horas."
            : "Configura la contraseña de propietario en Vercel para habilitar Action Center."}
        </p>
      </div>
      {configured ? (
        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña de propietario"
            autoComplete="current-password"
            name="password"
            required
          />
          <button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
          {error ? <small>{error}</small> : null}
        </form>
      ) : (
        <div className="ownerGateStatus">LOCKED</div>
      )}
    </section>
  );
}
