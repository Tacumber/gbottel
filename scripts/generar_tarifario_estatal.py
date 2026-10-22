#!/usr/bin/env python3
"""Genera src/data/tarifario_estatal.json (modelo de categorías con servicios) a partir de:
  - src/data/servicios_seed.json            (catálogo real, 1858 servicios: fuente de precios)
  - src/data/procedimientos_tarifario.json  (ficha de Gemini: procedimiento por categoría y datos de 20 servicios)
Los importes NO se calculan ni se toman del archivo de Gemini: salen del catálogo, tal cual.
Uso: python3 scripts/generar_tarifario_estatal.py
"""
import json, os
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, 'src', 'data')
seed = json.load(open(os.path.join(D, 'servicios_seed.json'), encoding='utf-8'))
gem = json.load(open(os.path.join(D, 'procedimientos_tarifario.json'), encoding='utf-8'))

def clave(codigo):
    p = codigo.split('-')
    return p[1] if len(p) >= 3 else codigo

fichas, cat_de = {}, {}
categorias = {}
for c in gem['categorias']:
    categorias[c['id_categoria']] = {'id_categoria': c['id_categoria'], 'nombre_categoria': c['nombre_categoria'], 'procedimiento': c['procedimiento'], 'servicios': []}
    for s in c['servicios']:
        fichas[s['codigo']] = s
        cat_de[s['codigo']] = c['id_categoria']

for x in seed:
    k = clave(x['codigoServicio'])
    cid = cat_de.get(k) or k[:2]
    if cid not in categorias:
        categorias[cid] = {'id_categoria': cid, 'nombre_categoria': None, 'procedimiento': None, 'servicios': []}
    f = fichas.get(k)
    proc = categorias[cid]['procedimiento'] if f else None   # solo los servicios con ficha llevan procedimiento propio
    categorias[cid]['servicios'].append({
        'codigo': k,
        'codigo_completo': x['codigoServicio'],
        'descripcion': x['nombreServicio'],
        'unidad_medida': x['unidad'],
        'tarifa': x['precioBase'],
        'modalidad': x['categoria'],
        'tiempo_estimado_minutos': x['tiempoEstimado'],
        'cantidad_tecnicos': x['cantidadTecnicos'],
        'id_propietario': x['idPropietario'],
        'complejidad': f.get('complejidad') if f else None,
        'herramientas_requeridas': f.get('herramientas_requeridas', []) if f else [],
        'procedimiento': proc,
    })
out = {'categorias': [categorias[k] for k in sorted(categorias)]}
json.dump(out, open(os.path.join(D, 'tarifario_estatal.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
n = sum(len(c['servicios']) for c in out['categorias'])
print(f'{len(out["categorias"])} categorías, {n} servicios, {sum(1 for c in out["categorias"] for s in c["servicios"] if s["procedimiento"])} con procedimiento')
