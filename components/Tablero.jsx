"use client";
import { useEffect, useRef, useState, useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createClient } from "@supabase/supabase-js";
import { GlowCard } from "@/components/ui/spotlight-card";

gsap.registerPlugin(ScrollTrigger);
const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const fmt = (n) => Number(n).toLocaleString("es-CO");
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const LEMA = "New skills, new opportunities: women in Latin America";

// ---------- Tooltip compartido ----------
function useTip() {
  const ref = useRef(null);
  const show = (e, html) => {
    const t = ref.current;
    if (!t) return;
    t.innerHTML = html;
    t.style.opacity = 1;
    t.style.left = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 8) + "px";
    t.style.top = e.clientY - 38 + "px";
  };
  const hide = () => ref.current && (ref.current.style.opacity = 0);
  return { ref, show, hide };
}

// ---------- Tarjeta con brillo que sigue al puntero (GlowCard, colores de marca) ----------
function Tarjeta({ children }) {
  return (
    <div className="revelar" data-revelar>
      <GlowCard glowColor="nova" customSize className="tarjeta-glow">
        <div className="tarjeta">{children}</div>
      </GlowCard>
    </div>
  );
}

// ---------- Tarjeta de país ----------
function Pais({ p }) {
  const supr = p.n === null;
  const w = supr ? 0 : Math.min(100, (p.n / p.meta) * 100);
  return (
    <Tarjeta>
      <h3>{p.pais}</h3>
      <p className="sub">Meta: {p.meta} empresas</p>
      {supr ? (
        <div className="pais-n texto display">menos de 5</div>
      ) : (
        <div className="pais-n">
          <span data-cuenta={p.n}>{fmt(p.n)}</span>
          <small> / {p.meta}</small>
        </div>
      )}
      <div className="barra"><i data-barra style={{ width: w + "%" }} /></div>
      <div className="fila-meta">
        <span>{supr ? "" : `${p.pct} % de la meta`}</span>
        <span>{supr ? "" : p.n >= p.meta ? "Meta cumplida ✓" : `Faltan ${fmt(p.meta - p.n)}`}</span>
      </div>
      {p.n === 0 && <p className="nota">Aún sin respuestas.</p>}
    </Tarjeta>
  );
}

// ---------- Curva acumulada ----------
function Curva({ serie, tip }) {
  const [hover, setHover] = useState(null);
  if (!serie.length) return <p className="vacio">Aparecerá cuando haya al menos 5 respuestas.</p>;
  const W = 640, H = 230, L = 34, R = 14, T = 14, B = 28;
  const max = Math.max(5, ...serie.map((s) => s.acum));
  const top = Math.ceil((max * 1.15) / 10) * 10;
  const x = (i) => L + (serie.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (serie.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const d = serie.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s.acum)}`).join("");
  const area = d + `L${x(serie.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const lab = (s) => new Date(s.d + "T12:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  const paso = Math.ceil(serie.length / 6);
  const mover = (e) => {
    const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    const px = ((e.clientX - r.left) * W) / r.width;
    const i = Math.max(0, Math.min(serie.length - 1, Math.round((px - L) / ((W - L - R) / Math.max(1, serie.length - 1)))));
    setHover(i);
    tip.show(e, `<b>${lab(serie[i])}</b> · ${serie[i].acum} respuestas`);
  };
  return (
    <svg className="curva" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Respuestas acumuladas por día">
      <defs>
        <linearGradient id="relleno" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f4cc24" stopOpacity=".28" />
          <stop offset="1" stopColor="#f4cc24" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, top / 2, top].map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.08)" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text>
        </g>
      ))}
      <path d={area} fill="url(#relleno)" data-area />
      <path d={d} fill="none" stroke="#f4cc24" strokeWidth="2" strokeLinejoin="round" data-trazo />
      {serie.map((s, i) =>
        i % paso === 0 || i === serie.length - 1 ? (
          <text key={s.d} x={x(i)} y={H - 6} textAnchor={i === serie.length - 1 ? "end" : i === 0 ? "start" : "middle"}>{lab(s)}</text>
        ) : null
      )}
      {hover !== null && (
        <>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" />
          <circle cx={x(hover)} cy={y(serie[hover].acum)} r="5" fill="#f4cc24" stroke="#070332" strokeWidth="2" />
        </>
      )}
      <circle cx={x(serie.length - 1)} cy={y(serie.at(-1).acum)} r="5" fill="#f4cc24" stroke="#070332" strokeWidth="2" />
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={mover} onMouseLeave={() => { setHover(null); tip.hide(); }} />
    </svg>
  );
}

// ---------- Barras de perfil ----------
function Barras({ titulo, sub, dist, base: refDist, tip }) {
  const vacio = dist.suprimido || !dist.categorias.length || dist.categorias.every((c) => c.k === "Otras categorías");
  if (vacio)
    return (
      <Tarjeta>
        <h3>{titulo}</h3>
        {sub && <p className="sub">{sub}</p>}
        <p className="vacio">Ninguna opción llega aún a 5 respuestas; aparecerá a medida que lleguen más.</p>
      </Tarjeta>
    );
  const refTot = refDist ? refDist.reduce((a, c) => a + c.n, 0) : 0;
  const visibles = new Set(dist.categorias.map((c) => c.k));
  const refPct = (k) => {
    if (!refDist) return null;
    if (k === "Otras categorías") return pct(refDist.filter((r) => !visibles.has(r.k)).reduce((a, c) => a + c.n, 0), refTot);
    const r = refDist.find((r) => r.k === k);
    return pct(r ? r.n : 0, refTot);
  };
  return (
    <Tarjeta>
      <h3>{titulo}</h3>
      {sub && <p className="sub">{sub}</p>}
      {refDist && (
        <div className="leyenda">
          <span><i style={{ background: "var(--s-resp)" }} />Respuestas</span>
          <span><i style={{ background: "var(--s-ref)", height: 3 }} />Base CCB (2.000 empresas)</span>
        </div>
      )}
      <div className="hb">
        {dist.categorias.map((c) => {
          const p = pct(c.n, dist.total), rp = refPct(c.k);
          const html = `<b>${c.k}</b><br>${c.n} respuestas · ${p} %` + (rp !== null ? `<br>Base CCB: ${rp} %` : "");
          return [
            <div className="k" key={c.k + "k"} title={c.k}>{c.k === "Otras categorías" ? "Otras agrupadas" : c.k}</div>,
            <div className="t" key={c.k + "t"} onMouseMove={(e) => tip.show(e, html)} onMouseLeave={tip.hide}>
              <i data-crece style={{ "--w": p + "%" }} />
              {rp !== null && <b data-crece style={{ "--w": rp + "%" }} />}
            </div>,
            <div className="v" key={c.k + "v"}>{p} % <span>({c.n})</span></div>,
          ];
        })}
      </div>
    </Tarjeta>
  );
}

// ---------- Botón magnético ----------
function Iman({ children, onClick }) {
  const ref = useRef(null);
  const mover = (e) => {
    const r = ref.current.getBoundingClientRect();
    gsap.to(ref.current, { x: (e.clientX - r.left - r.width / 2) * 0.4, y: (e.clientY - r.top - r.height / 2) * 0.4, duration: 0.4, ease: "power3.out" });
  };
  const soltar = () => gsap.to(ref.current, { x: 0, y: 0, duration: 1, ease: "elastic.out(1, 0.35)" });
  return <button ref={ref} className="iman" onMouseMove={mover} onMouseLeave={soltar} onClick={onClick}>{children}</button>;
}

export default function Tablero() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(false);
  const raiz = useRef(null);
  const tip = useTip();

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const r = await fetch("/api/datos", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (vivo) { setD(j); setError(false); }
      } catch {
        if (vivo) setError(true);
      }
    };
    cargar();

    // Tiempo real con Supabase: cada cambio de nova_tablero llega a todas las páginas abiertas.
    // Cada minuto la página pide al servidor que sincronice si los datos tienen más de 45 s
    // (el servidor decide; con muchas páginas abiertas solo hay una sincronización por minuto).
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let canal = null, sb = null;
    if (url && anon) {
      sb = createClient(url, anon);
      canal = sb
        .channel("nova-tablero")
        .on("postgres_changes", { event: "*", schema: "public", table: "nova_tablero" }, (p) => {
          if (vivo && p.new && p.new.datos) { setD(p.new.datos); setError(false); }
        })
        .subscribe();
    }
    const latido = async () => {
      if (canal) {
        try { await fetch("/api/refrescar", { method: "POST" }); } catch { /* el próximo latido reintenta */ }
      } else cargar();
    };
    const id = setInterval(latido, 60000);
    return () => { vivo = false; clearInterval(id); if (canal) sb.removeChannel(canal); };
  }, []);

  // Animaciones: una sola vez, cuando llegan los primeros datos
  const listo = !!d;
  useIsoLayout(() => {
    if (!listo) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto) return;
    const ctx = gsap.context(() => {
      // Entrada del hero
      gsap.from(".linea-mascara > span", { yPercent: 110, duration: 1.1, ease: "power4.out", stagger: 0.12 });
      gsap.from(".lema, .hero-cifra, .barra-hero", { y: 30, opacity: 0, duration: 1, ease: "power3.out", stagger: 0.12, delay: 0.35 });
      gsap.from(".barra-hero i", { width: 0, duration: 1.8, ease: "power3.inOut", delay: 0.6 });

      // Contadores
      gsap.utils.toArray("[data-cuenta]").forEach((el) => {
        const fin = Number(el.dataset.cuenta), o = { v: 0 };
        gsap.to(o, {
          v: fin, duration: 1.8, ease: "power2.out", delay: el.closest(".hero") ? 0.5 : 0,
          scrollTrigger: el.closest(".hero") ? undefined : { trigger: el, start: "top 85%" },
          onUpdate: () => (el.textContent = fmt(Math.round(o.v))),
        });
      });

      // Tarjetas: aparecen y sus barras crecen
      gsap.utils.toArray("[data-revelar]").forEach((t) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: t, start: "top 88%" } });
        tl.from(t, { y: 50, opacity: 0, duration: 0.9, ease: "power3.out" });
        const barras = t.querySelectorAll("[data-crece], [data-barra]");
        if (barras.length) tl.from(barras, { scaleX: 0, transformOrigin: "left", duration: 1, ease: "power3.out", stagger: 0.06 }, "-=0.5");
      });

      // Curva que se dibuja
      const trazo = document.querySelector("[data-trazo]");
      if (trazo) {
        const len = trazo.getTotalLength();
        gsap.fromTo(trazo, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 2, ease: "power2.inOut", scrollTrigger: { trigger: trazo, start: "top 85%" } });
        gsap.from("[data-area]", { opacity: 0, duration: 1.4, delay: 0.8, scrollTrigger: { trigger: trazo, start: "top 85%" } });
      }

      // Cintas diagonales: bucle continuo + empuje con el scroll
      gsap.utils.toArray(".cinta .pista").forEach((p, i) => {
        gsap.to(p, { xPercent: i ? 0 : -50, startAt: { xPercent: i ? -50 : 0 }, duration: 38, ease: "none", repeat: -1 });
      });
      gsap.to(".cinta", { x: (i) => (i ? 60 : -60), ease: "none", scrollTrigger: { trigger: ".cinta", start: "top bottom", end: "bottom top", scrub: true } });

      // Parallax suave de la aurora del hero
      gsap.to(".hero .aurora", { yPercent: 30, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

      // Telón: al terminar el contenido se descubre el footer con la palabra gigante
      gsap.fromTo(".gigante", { yPercent: 70, scale: 0.85, opacity: 0.2 }, {
        yPercent: 0, scale: 1, opacity: 1, ease: "none",
        scrollTrigger: { trigger: ".main", start: "bottom bottom", end: "bottom top", scrub: 0.6 },
      });
      gsap.from(".footer-in > *", {
        y: 60, opacity: 0, stagger: 0.1, ease: "none",
        scrollTrigger: { trigger: ".main", start: "bottom 90%", end: "bottom 30%", scrub: 0.6 },
      });
    }, raiz);
    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [listo]);

  const hora = d ? new Date(d.actualizado).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : null;
  const P = d?.perfil;
  const pista = (
    <div className="pista">
      {Array.from({ length: 6 }).map((_, i) => <span key={i}>{LEMA}</span>)}
    </div>
  );

  return (
    <div ref={raiz}>
      <div className="main">
        <header className="topbar">
          <div className="marca">NOVA<span>.</span></div>
          <div className="vivo">
            <span className={"punto" + (error ? " err" : "")} />
            {error ? "Reconectando…" : hora ? `En vivo · ${hora}` : "Conectando…"}
          </div>
        </header>

        {/* HERO */}
        <section className="hero">
          <div className="aurora"><i /><i /><i /></div>
          <div className="cuadricula" />
          <div className="hero-in">
            <div className="lema">{LEMA}</div>
            <h1 className="titulo display">
              <span className="linea-mascara"><span>Encuesta a</span></span>
              <span className="linea-mascara"><span>empresas, <em>en vivo</em></span></span>
            </h1>
            <div className="hero-cifra">
              <div className="cifra-grande">
                {d && d.nMeta !== null ? <span data-cuenta={d.nMeta}>{fmt(d.nMeta)}</span> : "–"}
              </div>
              <div className="cifra-de">/ {d ? d.metaTotal : 200}</div>
              <div className="cifra-txt">
                {d && d.pctMeta !== null
                  ? <>empresas han respondido: <b style={{ color: "var(--ink)" }}>{d.pctMeta} %</b> de la meta de 100 por país en Colombia y Ecuador.</>
                  : "empresas han respondido."}
              </div>
            </div>
            <div className="barra-hero"><i style={{ width: d ? Math.min(100, d.pctMeta || 0) + "%" : 0 }} /></div>
          </div>
          <div className="bajar">Desliza ↓</div>
        </section>

        {d && (
          <>
            {/* PAÍSES */}
            <section className="seccion">
              <h2 className="sec-titulo display">Avance por país</h2>
              <p className="sec-sub">Cada país tiene una meta de 100 empresas encuestadas.
                {d.otrosPaises ? ` Además llegaron respuestas de otros países (${d.otrosPaises}), que no suman a la meta.` : ""}</p>
              <div className="rejilla r-paises">
                {d.porPais.map((p) => <Pais key={p.pais} p={p} />)}
              </div>
            </section>

            <div className="cinta">{pista}</div>
            <div className="cinta b">{pista}</div>

            {/* RITMO */}
            <section className="seccion">
              <h2 className="sec-titulo display">Ritmo y cobertura</h2>
              <p className="sec-sub">Cómo crecen las respuestas día a día y cuánto de la base convocada ha contestado.</p>
              <div className="rejilla r-ritmo">
                <Tarjeta>
                  <h3>Respuestas acumuladas</h3>
                  <p className="sub">Colombia y Ecuador, por día</p>
                  <Curva serie={d.serie} tip={tip} />
                </Tarjeta>
                <Tarjeta>
                  <h3>Base de empresas convocadas</h3>
                  <p className="sub">Registro de la Cámara de Comercio de Bogotá</p>
                  <div className="kpis">
                    <div className="kpi"><div className="v"><span data-cuenta={d.base.poblacion}>{fmt(d.base.poblacion)}</span></div><div className="l">empresas en la base</div></div>
                    <div className="kpi"><div className="v"><span data-cuenta={d.base.contactables}>{fmt(d.base.contactables)}</span></div><div className="l">con correo válido</div></div>
                    <div className="kpi"><div className={"v" + (d.base.respondieron === null ? " txt" : "")}>{d.base.respondieron === null ? "menos de 5" : fmt(d.base.respondieron)}</div><div className="l">de la base ya respondieron</div></div>
                    <div className="kpi"><div className="v">{d.base.tasa === null ? "–" : d.base.tasa + " %"}</div><div className="l">tasa de respuesta de la base</div></div>
                  </div>
                  <p className="nota">{d.base.fueraDeBase === null
                    ? "La mayoría de respuestas llegan por otros canales, fuera de esta base."
                    : `${fmt(d.base.fueraDeBase)} respuestas llegaron por otros canales, fuera de esta base.`}</p>
                </Tarjeta>
              </div>
            </section>

            {/* PERFIL */}
            <section className="seccion">
              <h2 className="sec-titulo display">Quiénes han respondido</h2>
              <p className="sec-sub">El perfil de las empresas, todavía sin analizar el contenido de sus respuestas.</p>
              <div className="rejilla r-perfil">
                <Barras tip={tip} titulo="Tamaño de la empresa" sub="Registro oficial o lo declarado, frente a la base" dist={P.tamano} base={d.base.distTamano} />
                <Barras tip={tip} titulo="Gran sector" sub="Comparado con la base de empresas convocadas" dist={P.sector3} base={d.base.distSector} />
                <Barras tip={tip} titulo="Sector económico" sub="Como lo declaró la empresa" dist={P.sector} />
                <Barras tip={tip} titulo="Ubicación en Colombia" sub="Sede principal declarada" dist={P.region} />
                <Barras tip={tip} titulo="Cargo de quien responde" dist={P.cargo} />
                <Barras tip={tip} titulo="Quién responde" dist={P.responde} />
                <Barras tip={tip} titulo="Contrató en cargos de entrada" sub="Sin exigir título universitario, últimos 24 meses" dist={P.contrato} />
                <Barras tip={tip} titulo="Mujeres en cargos directivos" sub="Porcentaje aproximado declarado" dist={P.mujeresDir} />
              </div>
            </section>

            <p className="aviso">
              Los datos se actualizan solos cada minuto desde las respuestas del formulario. Por protección de datos,
              ningún grupo de menos de 5 respuestas se muestra por separado: se agrupa en «Otras categorías» o aparece
              como «menos de 5». El tamaño y el sector usan el registro oficial de la empresa cuando está disponible y,
              si no, lo que declaró la empresa.
            </p>
          </>
        )}
      </div>

      {/* FOOTER (telón) */}
      <footer className="footer">
        <div className="aurora"><i /><i /><i /></div>
        <div className="cuadricula" />
        <div className="footer-in">
          <div>
            <h4>Nuevas habilidades, nuevas oportunidades</h4>
            <p>Encuesta a empresas de Colombia y Ecuador sobre las competencias que buscan en sus cargos de entrada y en los pequeños negocios con los que trabajan.</p>
          </div>
          <Iman onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑ Volver al inicio</Iman>
        </div>
        <div className="gigante-wrap"><span className="gigante">NOVA</span></div>
        <div className="ue">
          Financiado por la Unión Europea. Las opiniones y puntos de vista expresados solo comprometen a su(s) autor(es) y no
          reflejan necesariamente los de la Unión Europea o los de la Agencia Ejecutiva Europea de Educación y Cultura (EACEA).
          Ni la Unión Europea ni la EACEA pueden ser considerados responsables de ellos. NOVA - New Skills, New Opportunities:
          Women in Latin America – project № 101242584
        </div>
      </footer>
      <div className="tip" ref={tip.ref} />
    </div>
  );
}
