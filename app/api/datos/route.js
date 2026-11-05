import { construir, leerSheet } from "@/lib/nova";
import { configurado, leerTablero, sincronizar } from "@/lib/supabase-servidor";

export const dynamic = "force-dynamic";
const CACHE = { "Cache-Control": "s-maxage=30, stale-while-revalidate=120" };

export async function GET() {
  try {
    if (configurado()) {
      const t = await leerTablero();
      // Si la tabla está vacía o muy vieja (>5 min), se sincroniza en el momento
      if (!t || Date.now() - new Date(t.actualizado).getTime() > 5 * 60 * 1000) {
        return Response.json(await sincronizar(), { headers: CACHE });
      }
      return Response.json(t.datos, { headers: CACHE });
    }
    // Sin Supabase: cálculo directo desde el Sheet
    return Response.json(construir(await leerSheet()).agregado, { headers: CACHE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "No se pudo leer la fuente de datos" }, { status: 502 });
  }
}
