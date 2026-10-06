"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OwnerGate({ configured }) {
  const router = useRouter();
  const [token, setToken] = useState("");
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
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "No se pudo abrir la sesión.");
        return;
      }
      setToken("");
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
            ? "Las acciones que pueden consumir créditos o escribir handoffs están protegidas. Introduce tu token privado para abrir una sesión de 12 horas."
            : "Añade SVL_OWNER_TOKEN en Vercel para habilitar Action Center. No compartas ese token en ChatGPT."}
        </p>
      </div>
      {configured ? (
        <form onSubmit={submit}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="SVL owner token"
            autoComplete="current-password"
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
