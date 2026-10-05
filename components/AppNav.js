import Link from "next/link";

export default function AppNav({ active }) {
  return (
    <nav className="nav" aria-label="Principal">
      <Link href="/" className={active === "hoy" ? "navActive" : ""}>Hoy</Link>
      <Link href="/scans" className={active === "scans" ? "navActive" : ""}>Scans</Link>
      <Link href="/picks" className={active === "picks" ? "navActive" : ""}>Picks</Link>
      <span>Portfolio</span>
      <Link href="/actions" className={active === "actions" ? "navActive" : ""}>Acciones</Link>
    </nav>
  );
}
