// Tablero NOVA — lógica del servidor: lee el Sheet de respuestas, cruza con la base CCB
// (hash de nombre) y devuelve SOLO agregados. Ningún nombre, correo ni texto libre sale de aquí.
// Supresión de grupos pequeños según NOVA_N_MIN (ADR-0003 + ADR-0021); con N_MIN>1 el valor suprimido no llega al navegador.
// construir() devuelve { agregado (público), registros (privados, para Supabase) }.
// Variables de entorno: GOOGLE_SA_JSON (credencial de la Service Account, JSON completo),
// NOVA_HASH_KEY (clave del HMAC de la base), NOVA_SHEET_ID (opcional), NOVA_EXCLUIR (opcional, nombres separados por "|" a tratar como prueba).
const crypto = require("crypto");

const SHEET_ID = process.env.NOVA_SHEET_ID || "1KkrmoVF6C6SFEf24ia-up8INbYPSAtD76c8EthJtQGw";
const RANGO = "'Respuestas de formulario 1'!A1:CP";
const METAS = { Colombia: 100, Ecuador: 100 };
// Umbral de supresión. ADR-0021 (2026-11-05): evaluado para NOVA → sin supresión (1).
// NOVA_N_MIN=5 restablece la regla n<5 de ADR-0003 sin tocar código.
const N_MIN = Math.max(1, Number(process.env.NOVA_N_MIN) || 1);
const EXCLUIR = (process.env.NOVA_EXCLUIR || "FUNDACION ROFE").split("|").map((s) => norm(s));

const BASE = require("../data/base_ccb.json");

// Debe ser idéntica a norm() en generar_datos_base.py
function norm(s) {
  s = String(s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toUpperCase();
  s = s.replace(/[^A-Z0-9 ]/g, " ");
  s = s.replace(/\b(S A S|SAS|S A|SA|LTDA|LLC|INC|BIC|E U|EU|S EN C|COLOMBIA)\b/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
// HMAC con clave secreta: el repo es público y no debe permitir comprobar qué empresas están en la base
const hash = (s) => crypto.createHmac("sha256", process.env.NOVA_HASH_KEY || "").update(norm(s)).digest("hex").slice(0, 16);

async function token() {
  const sa = JSON.parse(process.env.GOOGLE_SA_JSON);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const firma = crypto.createSign("RSA-SHA256").update(cuerpo).sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${cuerpo}.${firma}`,
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}

// Una fila resaltada con color (amarillo/naranja: el equipo marca así las de prueba) no cuenta.
// Se considera "resaltada" si alguna de sus primeras columnas tiene un fondo saturado
// (blanco, grises y el morado del encabezado no cuentan como marca).
function resaltada(celdas) {
  return celdas.slice(0, 4).some((c) => {
    const b = c?.effectiveFormat?.backgroundColor || {};
    const r = b.red ?? 0, g = b.green ?? 0, bl = b.blue ?? 0;
    return Math.max(r, g, bl) - Math.min(r, g, bl) > 0.35 && r > 0.8 && bl < 0.5; // tonos amarillos/naranjas
  });
}

async function leerSheet() {
  const campos = "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${encodeURIComponent(RANGO)}&fields=${encodeURIComponent(campos)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!r.ok) throw new Error(`sheets ${r.status}`);
  const filasApi = (await r.json()).sheets?.[0]?.data?.[0]?.rowData || [];
  const filas = filasApi.map((f) => (f.values || []).map((c) => c.formattedValue ?? ""));
  const marcadas = filasApi.map((f, i) => i > 0 && resaltada(f.values || []));
  return { filas, marcadas };
}

// ---------- Normalizaciones ----------
function pais(v) {
  const k = String(v || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").trim().toUpperCase();
  if (!k) return null;
  if (k.startsWith("COL")) return "Colombia";
  if (k.startsWith("ECU")) return "Ecuador";
  return "Otro";
}
function tamanoDeclarado(v) {
  const nums = String(v).match(/\d+/g);
  if (!nums) return null;
  const tope = /m[aá]s de/i.test(v) ? Infinity : Number(nums[nums.length - 1]);
  if (tope <= 10) return "Micro";
  if (tope <= 50) return "Pequeña";
  if (tope <= 200) return "Mediana";
  return "Grande";
}
function sector3(v) {
  if (/manufactur/i.test(v)) return "Manufactura";
  if (/comercio/i.test(v)) return "Comercio";
  return v ? "Servicios" : null;
}
function region(dep) {
  const k = norm(dep);
  if (!k || k === "PRUEBA") return "Sin dato";
  if (/BOGOT|^DC$|\bD C\b/.test(k)) return "Bogotá D.C.";
  return "Otras regiones";
}
function fecha(v) {
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// ---------- Supresión n<5 (ADR-0003) ----------
// Categorías con 1–4 van a "Otras"; si "Otras" queda en 1–4, se le suma la categoría
// visible más pequeña hasta que llegue a ≥5 (evita deducirla restando del total).
function distribucion(valores, orden) {
  const c = {};
  valores.filter(Boolean).forEach((v) => (c[v] = (c[v] || 0) + 1));
  let vis = Object.entries(c).filter(([, n]) => n >= N_MIN);
  let otras = Object.entries(c).filter(([, n]) => n < N_MIN).reduce((a, [, n]) => a + n, 0);
  vis.sort((a, b) => a[1] - b[1]);
  while (otras > 0 && otras < N_MIN && vis.length) otras += vis.shift()[1];
  const total = vis.reduce((a, [, n]) => a + n, 0) + otras;
  if (total < N_MIN) return { total: null, categorias: [], suprimido: true };
  if (orden) vis.sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]));
  else vis.sort((a, b) => b[1] - a[1]);
  const categorias = vis.map(([k, n]) => ({ k, n }));
  if (otras >= N_MIN) categorias.push({ k: "Otras categorías", n: otras });
  return { total, categorias, suprimido: false };
}
const cifra = (n) => (n === 0 || n >= N_MIN ? n : null); // null = "menos de N_MIN"

function marcaISO(v) {
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const p = (x) => String(x || 0).padStart(2, "0");
  return `${m[3]}-${p(m[2])}-${p(m[1])}T${p(m[4])}:${m[5]}:${p(m[6])}-05:00`; // hora de Colombia
}

function construir({ filas, marcadas = [] }) {
  const [h, ...datos] = filas;
  const col = (prefijo) => h.findIndex((x) => x.trim().startsWith(prefijo));
  const C = {
    t: 0, emp: col("1. Nombre de la empresa"), emp2: col("1. Nombre de la Empresa"), pais: col("2. País"),
    dep: col("3. Departamento"), tam: col("5. Tamaño"), muj: col("6. Aproximadamente"), sec: col("7. Sector"),
    cargo: col("8. Cargo"), es: col("9. Usted es"), contrato: col("10. En los últimos 24"),
  };
  const v = (r, i) => (i >= 0 ? (r[i] || "").trim() : "");
  const motivo = (r, i) => {
    if (marcadas[i + 1]) return "fila resaltada en amarillo";
    if (norm(v(r, C.dep)) === "PRUEBA") return "marcada como prueba";
    if (EXCLUIR.includes(norm(v(r, C.emp) || v(r, C.emp2)))) return "cuenta interna";
    return null;
  };

  // Un registro por fila con marca temporal (para Supabase, privado) — incluye las excluidas
  const registros = datos.map((r, i) => {
    if (!v(r, C.t)) return null;
    const empresa = v(r, C.emp) || v(r, C.emp2);
    const e = BASE.empresas[hash(empresa)];
    const p = pais(v(r, C.pais));
    const fila = {};
    h.forEach((titulo, j) => { if (titulo && r[j]) fila[titulo.trim()] = r[j]; });
    return {
      id: crypto.createHash("sha256").update(v(r, C.t) + "|" + norm(empresa)).digest("hex").slice(0, 20),
      fila: i + 2,
      marca_temporal: marcaISO(v(r, C.t)),
      excluida: !!motivo(r, i),
      motivo_exclusion: motivo(r, i),
      datos: fila,
      fecha: fecha(v(r, C.t)),
      pais: p,
      fecha: fecha(v(r, C.t)),
      pais: p,
      enBase: !!(e && e.origen === "base"),
      enriquecida: !!e,
      tamano: (e && e.tamano) || tamanoDeclarado(v(r, C.tam)),
      sector3: (e && e.sector) || sector3(v(r, C.sec)),
      sector: v(r, C.sec) || null,
      region: p === "Colombia" ? region(v(r, C.dep)) : null,
      cargo: v(r, C.cargo) || null,
      es: v(r, C.es) || null,
      mujeresDir: v(r, C.muj) || null,
      contrato: /^s/i.test(v(r, C.contrato)) ? "Sí" : v(r, C.contrato) ? "No" : null,
    };
  }).filter(Boolean);
  const reg = registros.filter((x) => !x.excluida);

  // Perfil, curva y base se calculan solo con Colombia/Ecuador (países con meta): así ningún
  // total deja deducir cuántas respuestas llegaron de otros países.
  const regM = reg.filter((x) => METAS[x.pais]);

  const porPais = Object.entries(METAS).map(([p, meta]) => {
    const n = reg.filter((x) => x.pais === p).length;
    return { pais: p, meta, n: cifra(n), pct: cifra(n) === null ? null : Math.round((n / meta) * 1000) / 10 };
  });
  const nMeta = reg.filter((x) => METAS[x.pais]).length;
  const nOtros = reg.length - nMeta;
  const metaTotal = Object.values(METAS).reduce((a, b) => a + b, 0);

  // Acumulado diario (sin conteos diarios sueltos)
  const dias = {};
  regM.forEach((x) => x.fecha && (dias[x.fecha] = (dias[x.fecha] || 0) + 1));
  let acc = 0;
  // Solo puntos con acumulado ≥5 (los primeros días revelarían respuestas sueltas)
  const serie = Object.keys(dias).sort().map((d) => ({ d, acum: (acc += dias[d]) })).filter((p) => p.acum >= N_MIN);
  // Total general solo si no deja deducir "otros países" (1–4) restando nMeta
  const totalSeguro = nOtros === 0 || nOtros >= N_MIN ? cifra(reg.length) : null;

  const nBase = regM.filter((x) => x.enBase).length;
  const TAM = ["Micro", "Pequeña", "Mediana", "Grande"];

  const agregado = {
    actualizado: new Date().toISOString(),
    total: totalSeguro,
    metaTotal,
    nMeta: cifra(nMeta),
    pctMeta: cifra(nMeta) === null ? null : Math.round((nMeta / metaTotal) * 1000) / 10,
    otrosPaises: nOtros === 0 ? 0 : nOtros >= N_MIN ? nOtros : `menos de ${N_MIN}`,
    porPais,
    serie,
    base: {
      poblacion: BASE.poblacion,
      contactables: BASE.contactables,
      respondieron: cifra(nBase),
      tasa: cifra(nBase) === null ? null : Math.round((nBase / BASE.contactables) * 10000) / 100,
      // Si "respondieron" está suprimido, "fuera de base" también (si no, se deduce restando)
      fueraDeBase: cifra(nBase) === null ? null : cifra(regM.length - nBase),
      distTamano: TAM.filter((t) => BASE.dist_tamano[t]).map((k) => ({ k, n: BASE.dist_tamano[k] })),
      distSector: Object.entries(BASE.dist_sector).map(([k, n]) => ({ k, n })),
    },
    perfil: {
      tamano: distribucion(regM.map((x) => x.tamano), TAM),
      sector3: distribucion(regM.map((x) => x.sector3), ["Manufactura", "Comercio", "Servicios"]),
      sector: distribucion(regM.map((x) => x.sector)),
      region: distribucion(regM.map((x) => x.region), ["Bogotá D.C.", "Otras regiones", "Sin dato"]),
      cargo: distribucion(regM.map((x) => x.cargo)),
      responde: distribucion(regM.map((x) => x.es)),
      contrato: distribucion(regM.map((x) => x.contrato), ["Sí", "No"]),
      mujeresDir: distribucion(regM.map((x) => x.mujeresDir), [
        "Menos del 10 %", "10 % – 24 %", "25 % – 49 %", "50 % – 74 %", "75 % o más", "No sabe / No dispone de información",
      ]),
    },
    nMin: N_MIN,
  };
  return { agregado, registros };
}

module.exports = { construir, leerSheet };
