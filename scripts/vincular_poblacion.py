#!/usr/bin/env python3
"""Vincula cada prestación del tarifario de Población con el servicio equivalente de Estatal / Interno
SOLO para mostrar su procedimiento técnico. No copia ni compara precios y no mezcla los tarifarios:
escribe en tarifario_poblacion.json el campo `procedimiento_de` (código del servicio equivalente) y
genera docs/INFORME-POBLACION.md.

Regla (mismo código Y nombre equivalente):
  - nombre idéntico (sin acentos/signos/mayúsculas)                          → 'nombre_igual'
  - nombres de la misma prestación: un nombre contiene al otro, o comparten ≥ 60 % de las palabras → 'nombre_similar'
  - lista CONFIRMADOS (decisión del usuario)                                → 'confirmado'
  - cualquier otro caso (código ausente, nombre distinto, sin procedimiento) → NO se vincula y se lista para revisión.
Uso: python3 scripts/vincular_poblacion.py
"""
import json, os, re, unicodedata
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, 'src', 'data')
PARASITAS = {'de', 'del', 'la', 'el', 'a', 'y', 'en', 'un', 'una', 'con', 'hasta', 'mas', 'las', 'los', 'para', 'o'}

# Vinculaciones confirmadas por el usuario (22/10): mismo código, nombre distinto, mismo servicio.
CONFIRMADOS = {'2036', '2628', '3017', '7046', '8338', '8418'}

def nn(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def toks(s):
    return {t for t in nn(s).split() if t not in PARASITAS}

def main():
    pob = json.load(open(os.path.join(D, 'tarifario_poblacion.json'), encoding='utf-8'))
    modelo = json.load(open(os.path.join(D, 'tarifario_estatal.json'), encoding='utf-8'))
    est = {s['codigo']: s for c in modelo['categorias'] for s in c['servicios']}
    suma_antes = sum(p['precioCUP'] for p in pob)
    exactos, similares, confirmados, revisar = [], [], [], []
    for p in pob:
        p.pop('procedimiento_de', None); p.pop('coincidencia', None)
        e = est.get(p['codigo'])
        if not e:
            revisar.append((p, None, 'el código no existe en Estatal / Interno')); continue
        if not e['procedimiento']:
            revisar.append((p, e, 'el servicio equivalente no tiene procedimiento')); continue
        if p['codigo'] in CONFIRMADOS:
            p['procedimiento_de'] = e['codigo']; p['coincidencia'] = 'confirmado'; confirmados.append((p, e, 0)); continue
        a, b = nn(p['nombre']), nn(e['descripcion'])
        ta, tb = toks(p['nombre']), toks(e['descripcion'])
        jac = len(ta & tb) / len(ta | tb) if ta | tb else 0
        if a == b:
            p['procedimiento_de'] = e['codigo']; p['coincidencia'] = 'nombre_igual'; exactos.append((p, e, jac))
        elif a in b or b in a or jac >= 0.6:
            p['procedimiento_de'] = e['codigo']; p['coincidencia'] = 'nombre_similar'; similares.append((p, e, jac))
        else:
            revisar.append((p, e, f'nombre distinto (similitud {jac:.2f})'))
    assert sum(p['precioCUP'] for p in pob) == suma_antes, 'los precios no deben cambiar'
    json.dump(pob, open(os.path.join(D, 'tarifario_poblacion.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    L = ['# Procedimientos del tarifario de Población\n',
         'Generado por `scripts/vincular_poblacion.py`. Población es un tarifario independiente: solo se enlaza (campo `procedimiento_de`) con el servicio equivalente de Estatal / Interno para mostrar su procedimiento técnico. No se copian ni comparan precios.\n',
         '| Concepto | Cantidad |\n|---|---|',
         f'| Prestaciones de Población | {len(pob)} |',
         f'| Con procedimiento — nombre idéntico | {len(exactos)} |',
         f'| Con procedimiento — nombre similar (misma prestación) | {len(similares)} |',
         f'| Con procedimiento — confirmado por el usuario (nombre distinto) | {len(confirmados)} |',
         f'| Sin vincular (revisar) | {len(revisar)} |\n',
         '## Nombre similar (vinculadas; confirma que son el mismo servicio)\n']
    for p, e, j in similares:
        L.append(f'- {p["codigo"]}: «{p["nombre"]}» ↔ Estatal «{e["descripcion"]}» (similitud {j:.2f})')
    L.append('\n## Confirmados por el usuario (nombre distinto, mismo servicio)\n')
    for p, e, j in confirmados:
        L.append(f'- {p["codigo"]}: «{p["nombre"]}» ↔ Estatal «{e["descripcion"]}»')
    L.append('\n## Sin vincular (no tienen procedimiento en Población hasta que se confirme)\n')
    for p, e, m in revisar:
        L.append(f'- {p["codigo"]}: «{p["nombre"]}»' + (f' ↔ Estatal «{e["descripcion"]}»' if e else '') + f' — {m}')
    open(os.path.join(RAIZ, 'docs', 'INFORME-POBLACION.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print(f'{len(exactos)} idénticos, {len(similares)} similares, {len(confirmados)} confirmados, {len(revisar)} sin vincular; suma de precios intacta: {suma_antes}')

if __name__ == '__main__':
    main()
