#!/usr/bin/env python3
"""
Regenera data/traslapes.geojson para el módulo Traslapes del dashboard SIA.

Cuándo correrlo
---------------
Cada vez que cambie alguno de estos archivos:
    data/geometrias.geojson        (las 66 áreas del inventario)
    data/arcac.geojson             (los 30 núcleos agrarios)
    data/zona_patrimonio.geojson   (designaciones internacionales)

El módulo muestra en pantalla la fecha de generación. Si el dato del mapa
no coincide con las geometrías vigentes, es que falta correr esto.

Uso
---
    pip install shapely
    python tools/traslapes.py          # desde la raíz del repo

Criterios
---------
· De Zona Patrimonio SOLO se considera el polígono de Patrimonio Mundial
  (capa ZPM_POLIGONO). Ramsar, AICA y SIPAM quedan fuera por decisión
  institucional: se traslapan entre sí sobre el mismo humedal y no aportan
  información de gestión distinta.
· Umbral de 0.5 ha: por debajo son roces de digitalización, no traslapes.
· Superficies en proyección plana local (equirectangular a 19.35° N).
  Error < 0.1 % a escala CDMX.
"""
import json, math, itertools, os, sys, datetime

try:
    from shapely.geometry import shape, mapping
    from shapely.ops import transform, unary_union
except ImportError:
    sys.exit("Falta shapely.  Instálalo con:  pip install shapely")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(RAIZ, 'data', *p)

UMBRAL_HA   = 0.5       # traslape mínimo para considerarse real
SIMPLIFY_GR = 0.00002   # ~2 m · reduce el peso del archivo sin deformar
LAT0 = 19.35
K = math.cos(math.radians(LAT0))

def proj(x, y, z=None):
    return (x * 111320 * K, y * 110540)

def ha(g):
    return transform(proj, g).area / 10000

def cargar(ruta, nombre_fn, sub_fn, filtro=None):
    with open(ruta, encoding='utf-8') as fh:
        fc = json.load(fh)
    out = []
    for f in fc.get('features', []):
        if not f.get('geometry'):
            continue
        if filtro and not filtro(f['properties']):
            continue
        g = shape(f['geometry']).buffer(0)      # buffer(0) repara autointersecciones
        if g.is_empty:
            continue
        out.append({'n': nombre_fn(f['properties']),
                    's': sub_fn(f['properties']), 'g': g})
    return out

def cruzar(A, B, etiqueta, mismo=False):
    feats = []
    pares = (itertools.combinations(range(len(A)), 2) if mismo
             else itertools.product(range(len(A)), range(len(B))))
    for i, j in pares:
        a = A[i]
        b = (A if mismo else B)[j]
        if not a['g'].intersects(b['g']):
            continue
        inter = a['g'].intersection(b['g'])
        if inter.is_empty:
            continue
        h = ha(inter)
        if h < UMBRAL_HA:
            continue
        feats.append({
            'type': 'Feature',
            'properties': {
                'cruce': etiqueta,
                'a': a['n'], 'a_sub': a['s'],
                'b': b['n'], 'b_sub': b['s'],
                'ha': round(h, 2),
                'pct_a': round(100 * h / ha(a['g']), 1),
                'pct_b': round(100 * h / ha(b['g']), 1),
            },
            'geometry': mapping(inter.simplify(SIMPLIFY_GR, preserve_topology=True)),
        })
    return feats

def main():
    inv = cargar(D('geometrias.geojson'),
                 lambda p: p['nombre'], lambda p: p['grupo'])
    arc = cargar(D('arcac.geojson'),
                 lambda p: p['nombre'],
                 lambda p: 'ARCAC · ' + (p.get('tenencia') or ''))
    zp  = cargar(D('zona_patrimonio.geojson'),
                 lambda p: 'Zona Patrimonio Mundial (UNESCO)',
                 lambda p: 'Zona Patrimonio',
                 filtro=lambda p: p.get('capa') == 'ZPM_POLIGONO')

    print(f'inventario {len(inv)} · ARCAC {len(arc)} · Patrimonio Mundial {len(zp)}')

    feats = []
    feats += cruzar(inv, None, 'Inventario × Inventario', mismo=True)
    feats += cruzar(inv, arc,  'Inventario × ARCAC')
    feats += cruzar(inv, zp,   'Inventario × Zona Patrimonio')
    feats += cruzar(arc, zp,   'ARCAC × Zona Patrimonio')
    feats += cruzar(arc, None, 'ARCAC × ARCAC', mismo=True)

    gs = [x['g'] for x in inv]
    suma  = sum(ha(g) for g in gs)
    union = ha(unary_union(gs))

    fc = {
        'type': 'FeatureCollection',
        'generado': datetime.date.today().isoformat(),
        'umbral_ha': UMBRAL_HA,
        'suma_individual_ha': round(suma, 2),
        'union_ha': round(union, 2),
        'doble_conteo_ha': round(suma - union, 2),
        'nota': ('Intersecciones geométricas calculadas con Shapely. '
                 'De Zona Patrimonio solo se considera el polígono de Patrimonio '
                 'Mundial (UNESCO). Umbral 0.5 ha para excluir roces de digitalización.'),
        'features': feats,
    }
    destino = D('traslapes.geojson')
    with open(destino, 'w', encoding='utf-8') as fh:
        json.dump(fc, fh, ensure_ascii=False)

    from collections import Counter
    print(f'\n{len(feats)} traslapes ≥ {UMBRAL_HA} ha')
    for k, v in Counter(f['properties']['cruce'] for f in feats).items():
        print(f'   {k:32s} {v}')
    print(f'\ndoble conteo del inventario: {suma - union:,.2f} ha '
          f'(suma {suma:,.2f} · unión {union:,.2f})')
    print(f'escrito: {destino}  ({os.path.getsize(destino)/1024:.1f} KB)')
    print('\nNo olvides bumpear CACHE_VERSION en sw.js.')

if __name__ == '__main__':
    main()
