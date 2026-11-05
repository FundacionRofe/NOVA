// Sincroniza Sheet → Supabase. Público pero inofensivo: sin la clave solo actúa si el
// agregado tiene más de 45 s (así, con muchas páginas abiertas, hay como mucho una
// sincronización por minuto). Con la cabecera x-nova-clave = NOVA_SYNC_SECRET sincroniza
// al instante (lo usa el disparador del formulario en apps-script/alEnviarFormulario.gs).
import { configurado, leerTablero, sincronizar } from "@/lib/supabase-servidor";

export const dynamic = "force-dynamic";
const VIGENCIA_MS = 45 * 1000;

export async function POST(req) {
  if (!configurado()) return Response.json({ sincronizado: false, motivo: "sin Supabase" });
  try {
    const clave = process.env.NOVA_SYNC_SECRET;
    const forzar = !!clave && req.headers.get("x-nova-clave") === clave;
    const origen = /Google-Apps-Script/i.test(req.headers.get("user-agent") || "") ? "apps-script" : "navegador";
    console.log(`refrescar origen=${origen} forzado=${forzar}${req.headers.get("x-nova-clave") && !forzar ? " clave=INCORRECTA" : ""}`);
    if (!forzar) {
      const t = await leerTablero();
      if (t && Date.now() - new Date(t.actualizado).getTime() < VIGENCIA_MS) {
        return Response.json({ sincronizado: false, actualizado: t.actualizado });
      }
    }
    const a = await sincronizar();
    return Response.json({ sincronizado: true, actualizado: a.actualizado });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "No se pudo sincronizar" }, { status: 502 });
  }
}
