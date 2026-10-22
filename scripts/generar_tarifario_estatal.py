#!/usr/bin/env python3
"""Genera src/data/tarifario_estatal.json (categorías → servicios) y docs/INFORME-PROCEDIMIENTOS.md.

Uso: python3 scripts/generar_tarifario_estatal.py <carpeta_con_los_xlsx_de_procedimientos>

Entradas:
  - src/data/servicios_seed.json  catálogo real de 1858 servicios (FUENTE de códigos, nombres y TARIFAS).
  - Libros «NN Nombre 22.xlsx»    procedimientos técnicos oficiales + listado de cada familia.
Reglas:
  - Ninguna tarifa sale de los libros: el importe de cada servicio es el del catálogo, sin tocarlo.
  - El procedimiento se une por CÓDIGO. Un bloque sin código válido solo se une si su nombre coincide
    EXACTAMENTE (sin acentos/signos) con un único servicio del catálogo y su tiempo coincide (±1 min).
  - Si un código tiene 2 procedimientos se elige el de tiempo coincidente con el catálogo; si no hay
    forma de decidir, no se une y queda en el informe.
  - Un servicio sin procedimiento queda en null: nunca hereda el de otro.
"""
import collections, glob, json, os, re, sys, unicodedata
import openpyxl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extraer_procedimientos import extraer_libro, norm, codigo4

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, 'src', 'data')

# Familias (número del libro → nombre). Editable: es solo la etiqueta que se muestra.
FAMILIAS = {
    '02': 'Gong', '10': 'Equipos Electrodomésticos', '12': 'Audio y Luces', '20': 'Sistemas de Protección contra el Rayo (SPCR)',
    '23': 'Automática', '25': 'Pizarras', '26': 'UPS', '28': 'Grupos Electrógenos', '30': 'Energía',
    '40': 'Registro Electrónico', '50': 'Ofimática', '60': 'Redes Informáticas', '70': 'Climatización y Agua',
    '80': 'Lavandería', '82': 'Gastronomía', '90': 'TVS Comunicaciones', '96': 'TVS Seguridad',
    '100': 'Obras Inducidas', '900': 'VT, ST y AT',
}
TIPOS = [('instalacion', 'Instalación y Montaje'), ('montaje', 'Instalación y Montaje'), ('mantenimiento', 'Mantenimiento'),
         ('reparacion', 'Reparación'), ('revision', 'Revisión y Diagnóstico'), ('diagnostico', 'Revisión y Diagnóstico')]

def nn(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def tipo_normal(s):
    t = norm(s or '')
    for k, v in TIPOS:
        if k in t: return v
    return None

def listado_familia(ruta):
    """Códigos y tipo de servicio listados en la primera hoja de un libro."""
    wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    ws = wb.worksheets[0]
    res = {}
    for r in ws.iter_rows(values_only=True):
        r = [c for c in r if c is not None]
        if len(r) <= 5: continue
        for k, c in enumerate(r[:2]):
            s = str(int(c)) if isinstance(c, float) and c.is_integer() else str(c)
            if re.fullmatch(r'\d{3,4}', s):
                tipo = next((tipo_normal(x) for x in r[k + 1:] if isinstance(x, str) and tipo_normal(x)), None)
                res[s.zfill(4)] = tipo
                break
    return res

def main():
    carpeta = sys.argv[1]
    seed = json.load(open(os.path.join(D, 'servicios_seed.json'), encoding='utf-8'))
    cat = {}
    for x in seed:
        cat[x['codigoServicio'].split('-')[1]] = x
    assert len(cat) == len(seed) == 1858

    familia_de, tipo_de, bloques = {}, {}, []
    for ruta in sorted(glob.glob(os.path.join(carpeta, '**', '*.xlsx'), recursive=True)):
        libro = os.path.basename(ruta)
        fid = libro.split()[0]
        for cod, tipo in listado_familia(ruta).items():
            familia_de.setdefault(cod, fid)
            if tipo: tipo_de.setdefault(cod, tipo)
        for b in extraer_libro(ruta):
            b['libro'] = libro; b['familia'] = fid
            bloques.append(b)

    por_nombre = collections.defaultdict(list)
    for k, x in cat.items(): por_nombre[nn(x['nombreServicio'])].append(k)
    cerca = lambda a, b: a is not None and b is not None and abs(a - b) <= 1

    asignado = collections.defaultdict(list)   # código → bloques candidatos
    rescatados, sin_unir = [], []
    for b in bloques:
        c = b['codigo']
        if c in cat:
            asignado[c].append(b)
            continue
        cand = por_nombre.get(nn(b['prestacion']), [])
        if len(cand) == 1 and cerca(cat[cand[0]]['tiempoEstimado'], b['tiempo_minutos']):
            b['codigo_original'] = c; b['codigo'] = cand[0]
            asignado[cand[0]].append(b); rescatados.append(b)
        else:
            sin_unir.append(b)

    elegido, ambiguos = {}, []
    for c, bs in asignado.items():
        if len(bs) == 1:
            elegido[c] = bs[0]; continue
        misma = lambda x, y: x['actividades'] == y['actividades'] and x['tiempo_minutos'] == y['tiempo_minutos'] and x['tecnicos'] == y['tecnicos']
        if all(misma(bs[0], y) for y in bs[1:]):   # bloque repetido idéntico: da igual cuál
            elegido[c] = bs[0]; continue
        ok = [b for b in bs if cerca(cat[c]['tiempoEstimado'], b['tiempo_minutos'])]
        if len(ok) == 1: elegido[c] = ok[0]
        else: ambiguos.append((c, bs))

    categorias = collections.OrderedDict()
    def cat_de(c):
        f = familia_de.get(c) or (elegido[c]['familia'] if c in elegido else None)
        return f
    for c, x in sorted(cat.items()):
        f = cat_de(c) or 'SC'
        if f not in categorias:
            categorias[f] = {'id_categoria': f, 'nombre_categoria': FAMILIAS.get(f, 'Sin clasificar'), 'servicios': []}
        b = elegido.get(c)
        proc = None
        if b:
            proc = {'fuente': {'libro': b['libro'], 'hoja': b['hoja'], 'fila': b['fila']}, 'modalidad': b['modalidad'],
                    'tecnicos': b['tecnicos'], 'tiempo_minutos': b['tiempo_minutos'], 'actividades': b['actividades'], 'insumos': b['insumos']}
        categorias[f]['servicios'].append({
            'codigo': c, 'codigo_completo': x['codigoServicio'], 'descripcion': x['nombreServicio'], 'unidad_medida': x['unidad'],
            'tarifa': x['precioBase'], 'modalidad': x['categoria'], 'tipo_servicio': tipo_de.get(c) or (tipo_normal(b['modalidad']) if b else None),
            'tiempo_estimado_minutos': x['tiempoEstimado'], 'cantidad_tecnicos': x['cantidadTecnicos'], 'id_propietario': x['idPropietario'],
            'procedimiento': proc})
    orden = sorted(categorias, key=lambda k: (k == 'SC', int(k) if k.isdigit() else 9999))
    salida = {'categorias': [categorias[k] for k in orden]}
    json.dump(salida, open(os.path.join(D, 'tarifario_estatal.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    # ------- informe -------
    n_proc = len(elegido)
    dif_t = [(c, cat[c]['tiempoEstimado'], b['tiempo_minutos']) for c, b in elegido.items() if not cerca(cat[c]['tiempoEstimado'], b['tiempo_minutos'])]
    dif_tec = [(c, cat[c]['cantidadTecnicos'], b['tecnicos']) for c, b in elegido.items() if b['tecnicos'] is not None and b['tecnicos'] != cat[c]['cantidadTecnicos']]
    suma = [(c, round(sum(a['minutos'] or 0 for a in b['actividades']), 2), b['tiempo_minutos']) for c, b in elegido.items() if abs(sum(a['minutos'] or 0 for a in b['actividades']) - (b['tiempo_minutos'] or 0)) > 1]
    sin_min = [c for c, b in elegido.items() if any(a['minutos'] is None for a in b['actividades'])]
    sin_proc = [c for c in cat if c not in elegido]
    mod_tipo = {'Modalidad 1': 'Reparación', 'Modalidad 2': 'Revisión y Diagnóstico', 'Modalidad 3': 'Instalación y Montaje', 'Modalidad 4': 'Mantenimiento'}
    disc = [(c, cat[c]['categoria'], tipo_de[c]) for c in cat if tipo_de.get(c) and mod_tipo[cat[c]['categoria']] != tipo_de[c]]
    sin_fam = [c for c in cat if not familia_de.get(c)]
    L = []
    w = L.append
    w('# Informe de procedimientos del tarifario Estatal / Interno\n')
    w('Generado por `scripts/generar_tarifario_estatal.py` a partir de los libros «NN Nombre 22.xlsx» y del catálogo de 1858 servicios. Las tarifas NO se leen de los libros: son las del catálogo.\n')
    w('| Concepto | Cantidad |\n|---|---|')
    w(f'| Servicios del catálogo | {len(cat)} |')
    w(f'| Procedimientos técnicos leídos de los libros | {len(bloques)} |')
    w(f'| Servicios con procedimiento unido | {n_proc} |')
    w(f'| — por código | {n_proc - len(rescatados)} |')
    w(f'| — por nombre exacto + tiempo (código ausente o inválido) | {len(rescatados)} |')
    w(f'| Servicios SIN procedimiento (siguen en null) | {len(sin_proc)} |')
    w(f'| Procedimientos sin unir a ningún servicio | {len(sin_unir)} |')
    w(f'| Códigos con 2+ procedimientos sin poder decidir | {len(ambiguos)} |')
    w(f'| Servicios con familia por listado del libro | {len(cat) - len(sin_fam)} (el resto: «Sin clasificar») |\n')
    w('## Procedimientos sin unir (revisar)\n')
    for b in sin_unir: w(f'- código «{b["codigo"]}» · {b["prestacion"]} · {b["libro"]} / {b["hoja"]} fila {b["fila"]} · {b["tiempo_minutos"]} min')
    w('\n## Códigos con varios procedimientos sin decidir\n')
    for c, bs in ambiguos: w(f'- {c}: ' + '; '.join(f'{b["libro"]}/{b["hoja"]} fila {b["fila"]} ({b["tiempo_minutos"]} min)' for b in bs))
    w(f'\n## Tiempo del procedimiento distinto del tiempo del catálogo ({len(dif_t)}) — se une igual; el procedimiento trae su propio tiempo\n')
    w(', '.join(f'{c} (catálogo {a} / procedimiento {b})' for c, a, b in dif_t))
    w(f'\n\n## Nº de técnicos distinto ({len(dif_tec)})\n')
    w(', '.join(f'{c} (catálogo {a} / procedimiento {b})' for c, a, b in dif_tec))
    w(f'\n\n## La suma de las actividades no iguala el tiempo de solución ({len(suma)})\n')
    w(', '.join(f'{c} (suma {a} / tiempo {b})' for c, a, b in suma))
    w(f'\n\n## Actividades sin minutos ({len(sin_min)})\n')
    w(', '.join(sin_min))
    w(f'\n\n## «Modalidad 1–4» del catálogo frente al tipo de servicio del libro ({len(disc)} discrepancias de {sum(1 for c in cat if tipo_de.get(c))})\n')
    w('Correspondencia dominante: Modalidad 1 = Reparación, 2 = Revisión y Diagnóstico, 3 = Instalación y Montaje, 4 = Mantenimiento. No se modifica el catálogo; el libro se guarda aparte en `tipo_servicio`.\n')
    w(', '.join(f'{c} ({a} ≠ {t})' for c, a, t in disc))
    w(f'\n\n## Servicios sin procedimiento ({len(sin_proc)})\n')
    w(', '.join(sin_proc))
    open(os.path.join(RAIZ, 'docs', 'INFORME-PROCEDIMIENTOS.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print(f'{len(categorias)} categorías; {n_proc}/{len(cat)} con procedimiento ({len(rescatados)} por nombre); sin unir {len(sin_unir)}; ambiguos {len(ambiguos)}; sin procedimiento {len(sin_proc)}')

if __name__ == '__main__':
    main()
