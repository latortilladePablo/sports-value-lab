import AppNav from "../components/AppNav";

// Immediate route-transition shell: never waits for Google Sheets.
// The CURRENT state appears only after the authenticated page finishes.
export default function Loading() {
  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SVL</div>
          <div>
            <strong>Sports Value Lab</strong>
            <span>PAPER_LIVE · Control Center</span>
          </div>
        </div>
        <span className="sync">Actualizando…</span>
      </header>
      <AppNav />
      <section className="fallbackNotice" role="status" aria-live="polite">
        Cargando datos de Sports Value Lab. La navegación está disponible.
        <small>Las capturas de odds requieren validar CURRENT antes de ejecutarse.</small>
      </section>
    </main>
  );
}
