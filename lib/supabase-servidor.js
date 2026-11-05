// Escritura/lectura en Supabase desde el servidor (service_role; nunca llega al navegador).
// Tablas (supabase/001_nova_tablero.sql):
//   nova_respuestas — una fila por respuesta del formulario (PRIVADA: RLS sin políticas)
//   nova_tablero    — una sola fila con el agregado público (lectura anónima + Realtime)
const { construir, leerSheet } = require("./nova");

const URL_SB = process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configurado = () => !!(URL_SB && CLAVE);

async function rest(ruta, opciones = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: CLAVE,
      // Las claves nuevas (sb_secret_…) no son JWT: van solo en «apikey». Las antiguas (eyJ…) también en Authorization.
      ...(CLAVE.startsWith("eyJ") ? { Authorization: `Bearer ${CLAVE}` } : {}),
      "Content-Type": "application/json",
      ...(opciones.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`supabase ${ruta.split("?")[0]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function leerTablero() {
  const filas = await rest("nova_tablero?id=eq.1&select=datos,actualizado");
  return filas && filas[0] ? filas[0] : null;
}

// Lee el Sheet, recalcula y guarda todo. Devuelve el agregado.
async function sincronizar() {
  const { agregado, registros } = construir(await leerSheet());
  const ahora = new Date().toISOString();
  const filas = registros.map((x) => ({
    id: x.id, fila: x.fila, marca_temporal: x.marca_temporal,
    excluida: x.excluida, motivo_exclusion: x.motivo_exclusion,
    pais: x.pais, en_base: x.enBase, enriquecida: x.enriquecida,
    tamano: x.tamano, sector3: x.sector3, sector: x.sector, region: x.region,
    cargo: x.cargo, responde: x.es, contrato: x.contrato, mujeres_dir: x.mujeresDir,
    datos: x.datos, sincronizado: ahora,
  }));
  if (filas.length) {
    await rest("nova_respuestas?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(filas),
    });
  }
  // Filas borradas del Sheet: se quitan también de la base (por id, seguro ante dos
  // sincronizaciones simultáneas; nunca vacía la tabla si el Sheet llegara vacío)
  if (filas.length) {
    const ids = filas.map((f) => `"${f.id}"`).join(",");
    await rest(`nova_respuestas?id=not.in.(${ids})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
  await rest("nova_tablero?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, datos: agregado, actualizado: ahora }),
  });
  return agregado;
}

module.exports = { configurado, leerTablero, sincronizar };
