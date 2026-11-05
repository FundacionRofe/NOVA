import { construir, leerSheet } from "../../../lib/nova";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const datos = construir(await leerSheet());
    return Response.json(datos, { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "No se pudo leer la fuente de datos" }, { status: 502 });
  }
}
