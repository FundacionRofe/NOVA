# NOVA · Tablero de la encuesta a empresas

Página en tiempo real (Next.js en Vercel) con el avance de la encuesta NOVA a empresas
de Colombia y Ecuador: respuestas frente a la meta (100 por país), ritmo diario, cobertura
de la base convocada (CCB Bogotá, 2.000 empresas) y perfil de quienes respondieron
(tamaño, sector, ubicación, cargo, contratación).

## Cómo funciona

```
Google Form → Sheet de respuestas ──(Service Account, solo lectura)──▶ /api/datos (servidor)
                                                                         │  cruza con data/base_ccb.json
                                                                         │  y calcula SOLO agregados
                                                                         ▼
                                                            página (React + GSAP), refresca cada 60 s
```

- **Ningún dato individual llega al navegador**: ni nombres de empresa, ni correos, ni texto libre.
- **Grupos pequeños (ADR-0021 de la Fundación):** evaluado para NOVA → se muestran cifras exactas
  (se cuentan empresas, sin nombres). Con `NOVA_N_MIN=5` vuelve la supresión n<5: grupos de 1–4 se
  agrupan en «Otras agrupadas» o salen como «menos de 5» y se bloquean las restas que los deducen.
- `data/base_ccb.json` no contiene nombres: cada empresa de la base va como un HMAC de su
  nombre con la clave secreta `NOVA_HASH_KEY` (que no está en el repo), más su tamaño y sector
  oficiales. Sin la clave no se puede comprobar si una empresa está en la base.

## Variables de entorno

Ver `.env.example`. En Vercel: `GOOGLE_SA_JSON`, `NOVA_HASH_KEY` (obligatorias),
`NOVA_SHEET_ID` y `NOVA_EXCLUIR` (opcionales; `NOVA_EXCLUIR` lista nombres de respuestas de
prueba separados por `|`).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:4321  (requiere .env.local)
```

## Actualizar la base de empresas

La base original (con datos de contacto) vive fuera del repo. Para regenerar `data/base_ccb.json`:

```bash
python generar_datos_base.py "<ruta al xlsx de la base>"
```

Lee `NOVA_HASH_KEY` del entorno (o de `tools/nova/.env.nova` en el equipo de soporte) y, si
existe, el enriquecimiento manual de empresas fuera de la base (`tools/nova/enriquecimiento_web.json`,
solo entradas con confianza alta o media).

## Marca

Colores del manual de marca NOVA: Midnight Blue `#070332`, Golden Yellow `#f4cc24`,
Orchid `#b6579d`, Medium Aquamarine `#42b69f`. Las fuentes de marca (Gliker Black Expanded,
Century Gothic Pro) se sustituyen por Unbounded y Poppins (Google Fonts) hasta tener licencia
web de las originales.

---

Financiado por la Unión Europea. Las opiniones y puntos de vista expresados solo comprometen a
su(s) autor(es) y no reflejan necesariamente los de la Unión Europea o los de la Agencia Ejecutiva
Europea de Educación y Cultura (EACEA). Ni la Unión Europea ni la EACEA pueden ser considerados
responsables de ellos. NOVA - New Skills, New Opportunities: Women in Latin America – project № 101242584
