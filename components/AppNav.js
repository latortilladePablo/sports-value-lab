import Link from "next/link";

export default function AppNav({ active }) {
  return (
    <nav className="nav" aria-label="Principal">
      <Link href="/" className={active === "hoy" ? "navActive" : ""}>Hoy</Link>
      <Link href="/scans" className={active === "scans" ? "navActive" : ""}>Scans</Link>
      <span>Picks</span>
      <span>Portfolio</span>
      <span>Más</span>
    </nav>
  );
}
