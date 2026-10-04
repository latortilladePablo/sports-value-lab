import "./globals.css";

export const metadata = {
  title: "Sports Value Lab",
  description: "Centro de mando PAPER_LIVE de Sports Value Lab",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07111f",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
