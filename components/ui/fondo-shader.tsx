"use client";
// Fondo animado con shaders de Paper (@paper-design/shaders-react, Apache-2.0), en los colores
// del manual de marca NOVA. Inspirado en el hero «paper shaders» de reuno-ui en 21st.dev; ese
// componente exige API key y no declara licencia, así que se construye directo sobre la librería.
// Dos capas de MeshGradient (una base lenta y otra translúcida que se mueve distinto) + un velo
// oscuro para que el texto se lea bien. Con «reducir movimiento» del sistema queda quieto.
import { useEffect, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

const PALETAS = {
  // Inicio: azul medianoche con orquídea y aguamarina, un toque de amarillo
  inicio: {
    base: ["#070332", "#1a0b5e", "#b6579d", "#070332", "#42b69f"],
    capa: ["#070332", "#b6579d", "#f4cc24", "#0d0848"],
    velo: "radial-gradient(ellipse at 25% 55%, rgba(7,3,50,.78) 0%, rgba(7,3,50,.35) 55%, rgba(7,3,50,.15) 100%)",
  },
  // Final (telón): más cálido, con el amarillo y la orquídea al frente
  final: {
    base: ["#0d0848", "#b6579d", "#070332", "#f4cc24", "#42b69f"],
    capa: ["#070332", "#42b69f", "#b6579d", "#0d0848"],
    velo: "linear-gradient(180deg, rgba(13,8,72,.55) 0%, rgba(13,8,72,.25) 45%, rgba(13,8,72,.7) 100%)",
  },
} as const;

export function FondoShader({ variante = "inicio", className = "" }: { variante?: keyof typeof PALETAS; className?: string }) {
  const p = PALETAS[variante];
  const [quieto, setQuieto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setQuieto(mq.matches);
    const cambio = () => setQuieto(mq.matches);
    mq.addEventListener("change", cambio);
    return () => mq.removeEventListener("change", cambio);
  }, []);

  const lleno: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
  // Un degradado difuso no necesita resolución alta: se limita para que vaya fluido en equipos modestos
  const rendimiento = { minPixelRatio: 1, maxPixelCount: 1280 * 720 };
  return (
    <div className={`fondo-shader ${className}`} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <MeshGradient {...rendimiento} style={lleno} colors={[...p.base]} distortion={0.85} swirl={0.6} speed={quieto ? 0 : 0.28} grainOverlay={0.06} />
      <MeshGradient {...rendimiento} style={{ ...lleno, opacity: 0.45, mixBlendMode: "screen" }} colors={[...p.capa]} distortion={1} swirl={0.9} speed={quieto ? 0 : 0.18} rotation={140} />
      <div style={{ ...lleno, background: p.velo }} />
    </div>
  );
}
