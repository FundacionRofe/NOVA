"""Genera data/base_ccb.json para el tablero NOVA a partir de la base de empresas (tools/nova, PII).

Solo sale información de la persona jurídica, sin PII: un HMAC del nombre normalizado
(no el nombre; la clave NOVA_HASH_KEY vive en tools/nova/.env.nova y en Vercel, nunca en Git,
así el repo público no permite comprobar qué empresas fueron convocadas), tamaño CCB,
sector de ley y división CIIU. Rep. legal, correos, teléfonos
y NIT no salen de tools/.

Fuentes de la base (2026-11-05): CCB Bogotá (2.000) + «BD Empresas» del archivo «Base de datos
Proyecto NOVA - PT2» (empresas aliadas de los socios ROFÉ/FLOM/ESPOL/UNITECNAR, Colombia y Ecuador).
Cada empresa va dos veces si tiene correo: por HMAC del nombre y por HMAC del correo ("c:" + hash),
para cruzar las respuestas por cualquiera de los dos.

Uso:  python scripts/nova-tablero/generar_datos_base.py [ruta_xlsx_ccb] [ruta_xlsx_pt2]
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
PT2 = Path(sys.argv[2]) if len(sys.argv) > 2 else RAIZ / "tools/nova/pt2/Base_NOVA_PT2.xlsx"
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


def hc(correo: str) -> str:
    """HMAC del correo (minúsculas, sin espacios). Debe ser idéntica a hashCorreo() en lib/nova.js."""
    return "c:" + hmac.new(CLAVE, str(correo).strip().lower().encode(), hashlib.sha256).hexdigest()[:16]


def sector3(v):
    v = str(v or "").lower()
    if "manufactur" in v or "industria" in v:
        return "Manufactura"
    if "comercio" in v:
        return "Comercio"
    return "Servicios" if v.strip() and v != "nan" else None


def pais_pt2(v):
    v = str(v or "").strip().lower()
    return "Ecuador" if v.startswith("ecu") else "Colombia" if v.startswith("col") else None


CORREO_OK = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$")

TAM = {"2. Pequeña": "Pequeña", "3. Mediana": "Mediana", "4. Grande": "Grande", "1. Micro": "Micro"}
SECT = {"1 Sector Manufacturero": "Manufactura", "2 Sector Servicios": "Servicios", "3 Sector Comercio": "Comercio"}


def main():
    b = pd.read_excel(XLSX)
    motivo = b.get("Rebotó (motivo)", pd.Series([""] * len(b))).fillna("").astype(str)
    descartada = motivo.str.contains("Rebotó") & ~motivo.str.contains("temporal") | motivo.str.contains("baja")
    empresas = {}
    for _, r in b.iterrows():
        dato = {
            "tamano": TAM.get(str(r["TamañoEmpresa"]), None),
            "sector": SECT.get(str(r["SectorEconómicoLey"]), None),
            "ciiu": str(r["CiiuPrincipal"])[:2],
            "origen": "base",
            "pais": "Colombia",
        }
        empresas[h(r["Nombre"])] = dato
        correo = str(r.get("CorreoElectronicoComercial", "")).strip().lower()
        if CORREO_OK.match(correo):
            empresas.setdefault(hc(correo), dato)

    # Empresas aliadas (PT2): sin tamaño oficial; sector aproximado desde «Industria»
    pt2_unicas, pt2_contactables, pt2_pais = set(), set(), Counter()
    if PT2.exists():
        p = pd.read_excel(PT2, sheet_name="BD Empresas", header=3)
        for _, r in p.iterrows():
            pais = pais_pt2(r.get("País"))
            nombre = str(r.get("Empresa") or "").split(chr(10))[0].strip()
            if not pais or not nombre or nombre == "nan":
                continue
            k = norm(nombre)
            dato = {"tamano": None, "sector": sector3(r.get("Industria")), "ciiu": None, "origen": "aliados", "pais": pais}
            if k not in pt2_unicas:
                pt2_unicas.add(k)
                pt2_pais[pais] += 1
            empresas.setdefault(h(nombre), dato)
            correo = str(r.get("Correo") or "").strip().lower()
            if CORREO_OK.match(correo):
                empresas.setdefault(hc(correo), dato)
                pt2_contactables.add(k)
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
    ccb_contactables = int(len(b) - descartada.sum())
    out = {
        "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "poblacion": int(len(b)) + len(pt2_unicas),
        "contactables": ccb_contactables + len(pt2_contactables),
        "fuentes": [
            {"k": "Cámara de Comercio de Bogotá", "n": int(len(b)), "contactables": ccb_contactables},
            {"k": "Aliados de los socios NOVA", "n": len(pt2_unicas), "contactables": len(pt2_contactables)},
        ],
        "poblacion_pais": {"Colombia": int(len(b)) + pt2_pais["Colombia"], "Ecuador": pt2_pais["Ecuador"]},
        "dist_tamano": dict(Counter(TAM.get(str(x)) for x in b["TamañoEmpresa"])),
        "dist_sector": dict(Counter(SECT.get(str(x)) for x in b["SectorEconómicoLey"])),
        "empresas": empresas,
    }
    SALIDA.parent.mkdir(exist_ok=True)
    SALIDA.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"OK {SALIDA} · {len(empresas)} claves · población {out['poblacion']} {out['poblacion_pais']} · contactables {out['contactables']}")


if __name__ == "__main__":
    main()
