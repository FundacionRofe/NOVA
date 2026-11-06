import { Unbounded, Poppins } from "next/font/google";
import "./globals.css";

// Sustitutos libres de la tipografía de marca (Gliker Black Expanded / Century Gothic Pro)
const display = Unbounded({ subsets: ["latin"], weight: ["600", "800", "900"], variable: "--f-display" });
const body = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-body" });

export const metadata = {
  title: "Cuestionario Empresarial NOVA",
  description: "Avance en tiempo real de la encuesta NOVA a empresas de Colombia y Ecuador.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
