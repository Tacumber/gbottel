#!/usr/bin/env python3
"""Genera el TARIFARIO UNIFICADO de la app: src/data/tarifario_copextel.json (+ docs/INFORME-TARIFARIO.md).

Uso:
  python3 scripts/generar_tarifario.py <carpeta_procedimientos> <ANEXO_1.docx> <Tarifario_poblacion.xlsx>

Fuentes (ninguna se incluye en el repositorio; el resultado sí):
  1. ANEXO 1 (docx)            los 1858 servicios oficiales: código, prestación (nombre oficial), UM y tarifa Estatal / Interno.
  2. Libros «NN Nombre 22.xlsx» procedimientos técnicos (actividades, tiempos, técnicos, insumos) y familia de cada servicio.
  3. Tarifario de Población     82 prestaciones: código, nombre, UM y tarifa.
  + src/data/servicios_seed.json  catálogo de la app (vínculo con la base, modalidad, tiempo y técnicos).

Reglas:
  - Estatal e Interno comparten tarifa (`tarifas.estatal_interno`); Población es otra tarifa (`tarifas.poblacion`) en el MISMO
    servicio cuando el código existe en el Anexo y el nombre es equivalente; si no, queda como servicio solo de Población.
  - Los importes se copian tal cual de sus fuentes (nunca se calculan ni se redondean) y se comprueba que la tarifa del Anexo
    coincide con la del catálogo.
  - El procedimiento se une por CÓDIGO (o por nombre exacto + tiempo si el libro no trae código válido). Sin procedimiento = null.
"""
import collections, glob, json, os, re, sys, unicodedata
from decimal import Decimal
import docx, openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extraer_procedimientos import extraer_libro, norm

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, 'src', 'data')

FAMILIAS = {
    '02': 'Gong', '10': 'Equipos Electrodomésticos', '12': 'Audio y Luces', '20': 'Sistemas de Protección contra el Rayo (SPCR)',
    '23': 'Automática', '25': 'Pizarras', '26': 'UPS', '28': 'Grupos Electrógenos', '30': 'Energía',
    '40': 'Registro Electrónico', '50': 'Ofimática', '60': 'Redes Informáticas', '70': 'Climatización y Agua',
    '80': 'Lavandería', '82': 'Gastronomía', '90': 'TVS Comunicaciones', '96': 'TVS Seguridad',
    '100': 'Obras Inducidas', '900': 'VT, ST y AT',
}
TIPOS = [('instalacion', 'Instalación y Montaje'), ('montaje', 'Instalación y Montaje'), ('mantenimiento', 'Mantenimiento'),
         ('reparacion', 'Reparación'), ('revision', 'Revisión y Diagnóstico'), ('diagnostico', 'Revisión y Diagnóstico')]
PARASITAS = {'de', 'del', 'la', 'el', 'a', 'y', 'en', 'un', 'una', 'con', 'hasta', 'mas', 'las', 'los', 'para', 'o'}
# Servicios de Población con nombre distinto al del Anexo que el usuario confirmó como el mismo servicio (22/10).
CONFIRMADOS = {'2036', '2628', '3017', '7046', '8338', '8418'}

def nn(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def toks(s):
    return {t for t in nn(s).split() if t not in PARASITAS}

def tipo_normal(s):
    t = norm(s or '')
    for k, v in TIPOS:
        if k in t: return v
    return None

def precio_anexo(s):
    return float(Decimal(s.replace('.', '').replace(',', '.')))

def leer_anexo(ruta):
    t = docx.Document(ruta).tables[0]
    filas = [[c.text.strip() for c in r.cells] for r in t.rows]
    res = collections.OrderedDict()
    for f in filas:
        assert len(f) == 4 and f[0] not in res, f
        res[f[0]] = {'descripcion': ' '.join(f[1].split()), 'unidad_medida': f[2], 'tarifa': precio_anexo(f[3])}
    return res

def leer_poblacion(ruta):
    ws = openpyxl.load_workbook(ruta, data_only=True).worksheets[0]
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        c, n, u, p = r[:4]
        assert isinstance(p, int) and p >= 0, r
        out.append({'codigo': str(c).strip().zfill(4), 'nombre': ' '.join(str(n).split()), 'unidad': str(u).strip(), 'precio': p})
    return out

def listado_familia(ruta):
    ws = openpyxl.load_workbook(ruta, data_only=True, read_only=True).worksheets[0]
    res = {}
    for r in ws.iter_rows(values_only=True):
        r = [c for c in r if c is not None]
        if len(r) <= 5: continue
        for k, c in enumerate(r[:2]):
            s = str(int(c)) if isinstance(c, float) and c.is_integer() else str(c)
            if re.fullmatch(r'\d{3,4}', s):
                res[s.zfill(4)] = next((tipo_normal(x) for x in r[k + 1:] if isinstance(x, str) and tipo_normal(x)), None)
                break
    return res

def main():
    carpeta, ruta_anexo, ruta_pob = sys.argv[1:4]
    anexo = leer_anexo(ruta_anexo)
    pob = leer_poblacion(ruta_pob)
    seed = json.load(open(os.path.join(D, 'servicios_seed.json'), encoding='utf-8'))
    cat = {x['codigoServicio'].split('-')[1]: x for x in seed}
    assert len(anexo) == len(cat) == 1858 and set(anexo) == set(cat), 'el Anexo y el catálogo deben tener los mismos 1858 códigos'
    dif_precio = [c for c in cat if anexo[c]['tarifa'] != cat[c]['precioBase']]
    assert not dif_precio, f'tarifas del Anexo distintas del catálogo: {dif_precio[:5]}'

    familia_de, tipo_de, bloques = {}, {}, []
    for ruta in sorted(glob.glob(os.path.join(carpeta, '**', '*.xlsx'), recursive=True)):
        libro = os.path.basename(ruta); fid = libro.split()[0]
        for cod, tipo in listado_familia(ruta).items():
            familia_de.setdefault(cod, fid)
            if tipo: tipo_de.setdefault(cod, tipo)
        for b in extraer_libro(ruta):
            b['libro'] = libro; b['familia'] = fid; bloques.append(b)

    por_nombre = collections.defaultdict(list)
    for k in anexo:   # nombre del Anexo y nombre del catálogo (los libros usan cualquiera de los dos)
        for nom in {nn(anexo[k]['descripcion']), nn(cat[k]['nombreServicio'])}: por_nombre[nom].append(k)
    cerca = lambda a, b: a is not None and b is not None and abs(a - b) <= 1
    asignado, rescatados, sin_unir = collections.defaultdict(list), [], []
    for b in bloques:
        c = b['codigo']
        if c in cat: asignado[c].append(b); continue
        cand = sorted(set(por_nombre.get(nn(b['prestacion']), [])))
        if len(cand) == 1 and cerca(cat[cand[0]]['tiempoEstimado'], b['tiempo_minutos']):
            b['codigo'] = cand[0]; asignado[cand[0]].append(b); rescatados.append(b)
        else: sin_unir.append(b)
    elegido, ambiguos = {}, []
    for c, bs in asignado.items():
        misma = lambda x, y: x['actividades'] == y['actividades'] and x['tiempo_minutos'] == y['tiempo_minutos'] and x['tecnicos'] == y['tecnicos']
        if len(bs) == 1 or all(misma(bs[0], y) for y in bs[1:]): elegido[c] = bs[0]; continue
        ok = [b for b in bs if cerca(cat[c]['tiempoEstimado'], b['tiempo_minutos'])]
        if len(ok) == 1: elegido[c] = ok[0]
        else: ambiguos.append((c, bs))

    # --- Población: misma fila si el código existe y el nombre es equivalente ---
    pob_de, solo_pob, coincide = {}, [], {}
    for i, p in enumerate(pob):
        p['orden'] = i
        a = anexo.get(p['codigo'])
        if a:
            ta, tb = toks(p['nombre']), toks(a['descripcion'])
            jac = len(ta & tb) / len(ta | tb) if ta | tb else 0
            if nn(p['nombre']) == nn(a['descripcion']): coincide[p['codigo']] = 'nombre_igual'
            elif nn(p['nombre']) in nn(a['descripcion']) or nn(a['descripcion']) in nn(p['nombre']) or jac >= 0.6: coincide[p['codigo']] = 'nombre_similar'
            elif p['codigo'] in CONFIRMADOS: coincide[p['codigo']] = 'confirmado'
            else: raise SystemExit(f'Población {p["codigo"]}: mismo código pero nombre distinto sin confirmar: «{p["nombre"]}» ↔ «{a["descripcion"]}»')
            pob_de[p['codigo']] = p
        else:
            solo_pob.append(p)

    categorias = collections.OrderedDict()
    def categoria(f):
        f = f if f in FAMILIAS else 'SC'
        if f not in categorias:
            categorias[f] = {'id_categoria': f, 'nombre_categoria': FAMILIAS.get(f, 'Sin clasificar'), 'servicios': []}
        return categorias[f]
    def proc_de(b):
        return {'fuente': {'libro': b['libro'], 'hoja': b['hoja'], 'fila': b['fila']}, 'modalidad': b['modalidad'], 'tecnicos': b['tecnicos'],
                'tiempo_minutos': b['tiempo_minutos'], 'actividades': b['actividades'], 'insumos': b['insumos']}
    for c in sorted(cat):
        x, a, b, p = cat[c], anexo[c], elegido.get(c), pob_de.get(c)
        categoria(familia_de.get(c) or (b['familia'] if b else 'SC'))['servicios'].append({
            'codigo': c, 'codigo_completo': x['codigoServicio'], 'descripcion': a['descripcion'], 'unidad_medida': a['unidad_medida'],
            'tarifas': {'estatal_interno': a['tarifa'], 'poblacion': p['precio'] if p else None},
            'nombre_poblacion': p['nombre'] if p and nn(p['nombre']) != nn(a['descripcion']) else None,
            'poblacion_coincidencia': coincide.get(c), 'orden_poblacion': p['orden'] if p else None,
            'modalidad': x['categoria'], 'tipo_servicio': tipo_de.get(c) or (tipo_normal(b['modalidad']) if b else None),
            'tiempo_estimado_minutos': x['tiempoEstimado'], 'cantidad_tecnicos': x['cantidadTecnicos'], 'id_propietario': x['idPropietario'],
            'procedimiento': proc_de(b) if b else None})
    for p in solo_pob:
        categoria(p['codigo'][:2])['servicios'].append({
            'codigo': p['codigo'], 'codigo_completo': None, 'descripcion': p['nombre'], 'unidad_medida': p['unidad'],
            'tarifas': {'estatal_interno': None, 'poblacion': p['precio']}, 'nombre_poblacion': None, 'poblacion_coincidencia': None,
            'orden_poblacion': p['orden'], 'modalidad': None, 'tipo_servicio': None, 'tiempo_estimado_minutos': None,
            'cantidad_tecnicos': None, 'id_propietario': None, 'procedimiento': None})
    orden = sorted(categorias, key=lambda k: (k == 'SC', int(k) if k.isdigit() else 9999))
    salida = {'version': 1, 'fuentes': {'anexo': os.path.basename(ruta_anexo), 'poblacion': os.path.basename(ruta_pob), 'procedimientos': 'libros NN Nombre 22.xlsx'},
              'categorias': [categorias[k] for k in orden]}
    json.dump(salida, open(os.path.join(D, 'tarifario_copextel.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    # --- informe ---
    n_serv = sum(len(c['servicios']) for c in salida['categorias'])
    suma_pob = sum(p['precio'] for p in pob)
    con_pob_proc = [p['codigo'] for p in pob if p['codigo'] in elegido]
    sin_pob_proc = [p for p in pob if p['codigo'] not in elegido]
    nombres_dif = [(c, cat[c]['nombreServicio'], anexo[c]['descripcion']) for c in cat if nn(cat[c]['nombreServicio']) != nn(anexo[c]['descripcion'])]
    dif_t = [(c, cat[c]['tiempoEstimado'], b['tiempo_minutos']) for c, b in elegido.items() if not cerca(cat[c]['tiempoEstimado'], b['tiempo_minutos'])]
    dif_tec = [(c, cat[c]['cantidadTecnicos'], b['tecnicos']) for c, b in elegido.items() if b['tecnicos'] is not None and b['tecnicos'] != cat[c]['cantidadTecnicos']]
    suma = [(c, round(sum(a['minutos'] or 0 for a in b['actividades']), 2), b['tiempo_minutos']) for c, b in elegido.items() if abs(sum(a['minutos'] or 0 for a in b['actividades']) - (b['tiempo_minutos'] or 0)) > 1]
    mod_tipo = {'Modalidad 1': 'Reparación', 'Modalidad 2': 'Revisión y Diagnóstico', 'Modalidad 3': 'Instalación y Montaje', 'Modalidad 4': 'Mantenimiento'}
    disc = [(c, cat[c]['categoria'], tipo_de[c]) for c in cat if tipo_de.get(c) and mod_tipo[cat[c]['categoria']] != tipo_de[c]]
    sin_proc = [c for c in cat if c not in elegido]
    L = ['# Informe del tarifario unificado\n',
         'Generado por `scripts/generar_tarifario.py` con el Anexo 1, los libros de procedimientos y el tarifario de Población. Los importes se copian de sus fuentes sin calcular ni redondear.\n',
         '| Concepto | Valor |\n|---|---|',
         f'| Servicios en el tarifario unificado | {n_serv} ({len(cat)} del Anexo 1 + {len(solo_pob)} solo de Población) |',
         f'| Categorías (familias de los libros) | {len(salida["categorias"])} |',
         f'| Tarifa Estatal / Interno | 1858 servicios; coincide con el catálogo en los 1858 |',
         f'| Prestaciones de Población | {len(pob)}; suma de control {suma_pob} CUP |',
         f'| — en el mismo servicio del Anexo (nombre igual / similar / confirmado) | {sum(1 for v in coincide.values() if v == "nombre_igual")} / {sum(1 for v in coincide.values() if v == "nombre_similar")} / {sum(1 for v in coincide.values() if v == "confirmado")} |',
         f'| — solo de Población (código ausente en el Anexo) | {len(solo_pob)} |',
         f'| Procedimientos técnicos leídos | {len(bloques)} |',
         f'| Servicios con procedimiento | {len(elegido)} ({len(elegido) - len(rescatados)} por código, {len(rescatados)} por nombre exacto + tiempo) |',
         f'| Servicios sin procedimiento | {len(sin_proc)} de {len(cat)} |',
         f'| Prestaciones de Población con procedimiento | {len(con_pob_proc)} de {len(pob)} |',
         f'| Nombres que el Anexo corrige respecto al catálogo | {len(nombres_dif)} |\n',
         '## Población sin procedimiento\n']
    for p in sin_pob_proc: L.append(f'- {p["codigo"]}: {p["nombre"]}' + (' (solo Población)' if p['codigo'] not in cat else ' (el servicio no tiene procedimiento en los libros)'))
    L += ['\n## Procedimientos sin unir (revisar)\n']
    for b in sin_unir: L.append(f'- código «{b["codigo"]}» · {b["prestacion"]} · {b["libro"]} / {b["hoja"]} fila {b["fila"]} · {b["tiempo_minutos"]} min')
    L += [f'\n## Códigos con varios procedimientos distintos sin decidir ({len(ambiguos)})\n'] + [f'- {c}' for c, _ in ambiguos]
    L += [f'\n## Nombres: Anexo 1 frente al catálogo ({len(nombres_dif)}) — la app muestra el nombre del Anexo\n'] + [f'- {c}: «{a}» → «{b}»' for c, a, b in nombres_dif]
    L += [f'\n## Tiempo del procedimiento ≠ tiempo del catálogo ({len(dif_t)})\n', ', '.join(f'{c} ({a} / {b})' for c, a, b in dif_t)]
    L += [f'\n\n## Nº de técnicos distinto ({len(dif_tec)})\n', ', '.join(f'{c} (catálogo {a} / procedimiento {b})' for c, a, b in dif_tec)]
    L += [f'\n\n## La suma de actividades no iguala el tiempo de solución ({len(suma)})\n', ', '.join(f'{c} ({a} / {b})' for c, a, b in suma)]
    L += [f'\n\n## «Modalidad 1–4» del catálogo frente al tipo del libro ({len(disc)} de {sum(1 for c in cat if tipo_de.get(c))})\n',
          'Dominante: Modalidad 1 = Reparación, 2 = Revisión y Diagnóstico, 3 = Instalación y Montaje, 4 = Mantenimiento. No se modifica el catálogo.\n',
          ', '.join(f'{c} ({a} ≠ {t})' for c, a, t in disc), f'\n\n## Servicios sin procedimiento ({len(sin_proc)})\n', ', '.join(sin_proc)]
    open(os.path.join(RAIZ, 'docs', 'INFORME-TARIFARIO.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print(f'{n_serv} servicios; {len(salida["categorias"])} categorías; con procedimiento {len(elegido)}; Población {len(pob)} (solo Población {len(solo_pob)}, con procedimiento {len(con_pob_proc)}); suma Población {suma_pob}; nombres corregidos {len(nombres_dif)}')

if __name__ == '__main__':
    main()
