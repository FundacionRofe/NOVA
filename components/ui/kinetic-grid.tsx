"use client";
// Fondo «kinetic grid»: cuadrícula de puntos que se curva hacia el cursor y lanza ondas al hacer
// clic. Implementación propia en canvas 2D, inspirada en «kinetic-grid» de satoriui (21st.dev, MIT;
// su código exige API key). Pensado para ir detrás de una zona de la página (no de toda): el
// contenedor ocupa la zona y el canvas queda «pegado» (sticky) a la pantalla solo dentro de ella.
// - Solo anima mientras la zona está visible y hay movimiento (mouse reciente u ondas activas).
// - Con «reducir movimiento» dibuja la cuadrícula quieta, sin deformación ni ondas.
import { useEffect, useRef } from "react";

type Onda = { x: number; y: number; t0: number };

const ESPACIO = 34; // px entre puntos
const RADIO_MOUSE = 190; // alcance de la deformación
const FUERZA = 22; // desplazamiento máximo hacia el cursor
const ONDA_VEL = 620; // px/s
const ONDA_VIDA = 1.4; // s
const ONDA_ANCHO = 70; // grosor del frente de onda

export function KineticGrid({ className = "" }: { className?: string }) {
  const zona = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cont = zona.current!, cv = lienzo.current!;
    const ctx = cv.getContext("2d")!;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, visible = false, raf = 0;
    let mx = -1e4, my = -1e4, ultimoMov = 0;
    const ondas: Onda[] = [];

    const medir = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dibujar(performance.now());
    };

    const dibujar = (ahora: number) => {
      ctx.clearRect(0, 0, w, h);
      const t = ahora / 1000;
      for (let i = ondas.length - 1; i >= 0; i--) if (t - ondas[i].t0 > ONDA_VIDA) ondas.splice(i, 1);
      const offX = (w % ESPACIO) / 2, offY = (h % ESPACIO) / 2;
      for (let gx = offX; gx <= w; gx += ESPACIO) {
        for (let gy = offY; gy <= h; gy += ESPACIO) {
          let x = gx, y = gy, brillo = 0, calido = 0;
          if (!quieto) {
            // Atracción hacia el cursor (cae suave con la distancia)
            const dx = mx - gx, dy = my - gy, d = Math.hypot(dx, dy);
            if (d < RADIO_MOUSE && d > 0.01) {
              const k = (1 - d / RADIO_MOUSE) ** 2;
              x += (dx / d) * FUERZA * k; y += (dy / d) * FUERZA * k;
              brillo += k; calido += k;
            }
            // Ondas: empujan hacia afuera los puntos que toca el frente
            for (const o of ondas) {
              const edad = t - o.t0, frente = edad * ONDA_VEL;
              const ex = gx - o.x, ey = gy - o.y, de = Math.hypot(ex, ey);
              const delta = Math.abs(de - frente);
              if (delta < ONDA_ANCHO && de > 0.01) {
                const k = (1 - delta / ONDA_ANCHO) * (1 - edad / ONDA_VIDA);
                x += (ex / de) * 14 * k; y += (ey / de) * 14 * k;
                brillo += k * 0.9;
              }
            }
          }
          const b = Math.min(1, brillo);
          const r = 1.1 + b * 1.6;
          // Base blanca tenue → amarillo NOVA cerca del cursor; orquídea en las ondas
          const col = calido > 0.05
            ? `rgba(244,204,36,${0.16 + b * 0.75})`
            : b > 0.05 ? `rgba(182,87,157,${0.16 + b * 0.7})` : "rgba(246,244,255,0.13)";
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    };

    const bucle = (ahora: number) => {
      dibujar(ahora);
      const activo = ondas.length > 0 || ahora - ultimoMov < 1200;
      raf = visible && activo ? requestAnimationFrame(bucle) : 0;
    };
    const despertar = () => { if (!raf && visible && !quieto) raf = requestAnimationFrame(bucle); };

    const mover = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
      ultimoMov = performance.now();
      despertar();
    };
    const clic = (e: PointerEvent) => {
      const z = cont.getBoundingClientRect();
      if (e.clientY < z.top || e.clientY > z.bottom) return; // solo dentro de la zona
      const r = cv.getBoundingClientRect();
      ondas.push({ x: e.clientX - r.left, y: e.clientY - r.top, t0: performance.now() / 1000 });
      if (ondas.length > 6) ondas.shift();
      despertar();
    };
    const alScroll = () => { ultimoMov = performance.now(); despertar(); };
    const salir = () => { mx = my = -1e4; ultimoMov = performance.now(); despertar(); };

    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) { dibujar(performance.now()); despertar(); } });
    io.observe(cont);
    const ro = new ResizeObserver(medir);
    ro.observe(cv);
    window.addEventListener("pointermove", mover, { passive: true });
    window.addEventListener("pointerdown", clic, { passive: true });
    window.addEventListener("scroll", alScroll, { passive: true });
    document.addEventListener("pointerleave", salir);
    medir();
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerdown", clic);
      window.removeEventListener("scroll", alScroll);
      document.removeEventListener("pointerleave", salir);
    };
  }, []);

  return (
    <div ref={zona} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      <canvas ref={lienzo} style={{ position: "sticky", top: 0, display: "block", width: "100%", height: "100vh" }} />
    </div>
  );
}
