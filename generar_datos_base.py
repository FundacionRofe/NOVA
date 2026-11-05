"""Genera data/base_ccb.json para el tablero NOVA a partir de la base de empresas (tools/nova, PII).

Solo sale información de la persona jurídica, sin PII: un HMAC del nombre normalizado
(no el nombre; la clave NOVA_HASH_KEY vive en tools/nova/.env.nova y en Vercel, nunca en Git,
así el repo público no permite comprobar qué empresas fueron convocadas), tamaño CCB,
sector de ley y división CIIU. Rep. legal, correos, teléfonos
y NIT no salen de tools/.

Uso:  python scripts/nova-tablero/generar_datos_base.py [ruta_xlsx]
"""
import hashlib
import hmac
import os
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
XLSX = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "tools/nova/2026.11.04 Base empresas NOVA (con seguimiento).xlsx"
SALIDA = Path(__file__).parent / "data" / "base_ccb.json"
ENRIQ_WEB = RAIZ / "tools/nova/enriquecimiento_web.json"  # opcional, local (no se versiona)

SUFIJOS = r"\b(S A S|SAS|S A|SA|LTDA|LLC|INC|BIC|E U|EU|S EN C|COLOMBIA)\b"


def norm(s: str) -> str:
    """Debe ser idéntica a norm() en lib/nova.js."""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(SUFIJOS, " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _clave() -> bytes:
    if os.environ.get("NOVA_HASH_KEY"):
        return os.environ["NOVA_HASH_KEY"].encode()
    for linea in (RAIZ / "tools/nova/.env.nova").read_text().splitlines():
        if linea.startswith("NOVA_HASH_KEY="):
            return linea.split("=", 1)[1].strip().encode()
    raise SystemExit("Falta NOVA_HASH_KEY")


CLAVE = _clave()


def h(s: str) -> str:
    """Debe ser idéntica a hash() en lib/nova.js."""
    return hmac.new(CLAVE, norm(s).encode(), hashlib.sha256).hexdigest()[:16]


TAM = {"2. Pequeña": "Pequeña", "3. Mediana": "Mediana", "4. Grande": "Grande", "1. Micro": "Micro"}
SECT = {"1 Sector Manufacturero": "Manufactura", "2 Sector Servicios": "Servicios", "3 Sector Comercio": "Comercio"}


def main():
    b = pd.read_excel(XLSX)
    motivo = b.get("Rebotó (motivo)", pd.Series([""] * len(b))).fillna("").astype(str)
    descartada = motivo.str.contains("Rebotó") & ~motivo.str.contains("temporal") | motivo.str.contains("baja")
    empresas = {}
    for _, r in b.iterrows():
        empresas[h(r["Nombre"])] = {
            "tamano": TAM.get(str(r["TamañoEmpresa"]), None),
            "sector": SECT.get(str(r["SectorEconómicoLey"]), None),
            "ciiu": str(r["CiiuPrincipal"])[:2],
            "origen": "base",
        }
    # Enriquecimiento web (empresas que respondieron fuera de la base). Lista curada a mano.
    if ENRIQ_WEB.exists():
        for e in json.loads(ENRIQ_WEB.read_text(encoding="utf-8")):
            if e.get("confianza") in ("alta", "media"):
                empresas.setdefault(h(e["nombre_respuesta"]), {
                    "tamano": e.get("tamano_aprox"),
                    "sector": e.get("sector"),
                    "ciiu": None,
                    "origen": "web",
                })
    out = {
        "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "poblacion": int(len(b)),
        "contactables": int(len(b) - descartada.sum()),
        "dist_tamano": dict(Counter(TAM.get(str(x)) for x in b["TamañoEmpresa"])),
        "dist_sector": dict(Counter(SECT.get(str(x)) for x in b["SectorEconómicoLey"])),
        "empresas": empresas,
    }
    SALIDA.parent.mkdir(exist_ok=True)
    SALIDA.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"OK {SALIDA} · {len(empresas)} empresas · contactables {out['contactables']}/{out['poblacion']}")


if __name__ == "__main__":
    main()
