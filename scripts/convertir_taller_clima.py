#!/usr/bin/env python3
"""Convierte la base del taller de clima (formato antiguo, 200 filas) al modelo unificado
(src/data/tarifario_copextel.json), expandiendo abreviaturas. Los precios se copian sin tocar.
Uso: convertir_taller_clima.py <entrada.json> <salida_modelo.json> <salida_importable.json> <informe.md>
Salida 1: modelo unificado (Estatal/Interno y Población como categorías principales; las modalidades son los
grupos del taller). Salida 2: lista en formato antiguo, para los botones Importar/Reemplazar actuales."""
import json, re, sys, unicodedata
from collections import OrderedDict

ent, sal, imp, inf = sys.argv[1:5]
fila = json.load(open(ent, encoding='utf-8'))
modelo = json.load(open('src/data/tarifario_copextel.json', encoding='utf-8'))
S = {s['codigo']: (c, s) for c in modelo['categorias'] for s in c['servicios']}

TR = 'toneladas de refrigeración'
# (patrón, reemplazo) en orden; se aplican sobre el nombre ya con espacios normalizados
REGLAS = [
    (r'\bMtto\.?(?=\s|$)', 'Mantenimiento'),
    (r'\bRep\.(?=\s|$)', 'Reparación'),
    (r'\bTécn\.', 'Técnica '),
    (r'\bEquip\.', 'Equipos '),
    (r'filtro\.A/V', 'filtro de aire de ventana'),
    (r'> ?(\d+[.,]?\d*) h/ ?(\d+[.,]?\d*),?', r'mayor de \1 hasta \2 ' + TR + ','),
    (r'(?<=\d)\s*[Tt][Rr]\b', ' ' + TR),
    (r'\b[Tt][Rr]\b', TR),
    (r'(?<=\d)\s*[Hh][Pp]\b', ' caballos de fuerza'),
    (r'\bA/V\b', 'aire de ventana'),
    (r'\bAV\b', 'aire de ventana'),
    (r'\bA/A\b', 'aire acondicionado'),
    (r'\bc/ ?(?=\d)', 'con '),
    (r'\bx cada Km\b', 'por cada kilómetro'),
    (r'\bKm\b', 'kilómetros'),
    (r'\bMts\b', 'metros'),
    (r'(?<=\d)\s*mm\b', ' milímetros'),
    (r'(?<=\d)\s*[Mm]\b(?!\w)', ' metros'),
    (r'\bx cada kilómetros\b', 'por cada kilómetro'),
    (r'\bx cada\b', 'por cada'),
    (r'(?<=milímetros) x (?=\d)', ' por '),
    (r'\betc\.', 'etcétera'),
    (r'\bRooF\b', 'Roof'),
    (r'\bCajá\b', 'Caja'),
    (r'\bFria\b', 'Fría'), (r'\bCamara\b', 'Cámara'), (r'\bCamaras\b', 'Cámaras'),
    (r'\bcamras\b', 'cámaras'), (r'\bfrias\b', 'frías'), (r'\bFrias\b', 'Frías'), (r'\bcamaras\b', 'cámaras'),
    (r'\bPanelizacion\b', 'Panelización'), (r'\bpanelizacion\b', 'panelización'),
    (r'\bInstalacion\b', 'Instalación'), (r'\binstalacion\b', 'instalación'),
    (r'\bcubicos\b', 'cúbicos'), (r'\bmas\b', 'más'), (r'\belectricas\b', 'eléctricas'),
    (r'\bmecanicas\b', 'mecánicas'), (r'\belectronicas\b', 'electrónicas'),
    (r'\bAdaptacion\b', 'Adaptación'), (r'\brecuperacion\b', 'recuperación'),
    (r'\bDiagnostico\b', 'Diagnóstico'), (r'\bSistemas de Clima\b', 'Sistema de Clima'),
    (r'\bEspecificos\b', 'Específicos'), (r'\bvalvula\b', 'válvula'),
    (r'\bCasette\b', 'Cassette'),
    (r'(\w),(?=\w)', None),  # marcador: coma pegada, se maneja aparte
]

def limpia(n):
    n = re.sub(r'\s+', ' ', n).strip()
    n = re.sub(r'\s+([,;:)])', r'\1', n)
    n = re.sub(r'\(\s+', '(', n)
    n = re.sub(r'(?<=\w)\(', ' (', n)
    n = re.sub(r'(?<=[a-zñ]),(?=[A-Za-zÁ-ú])', ', ', n)
    n = re.sub(r'\.(?=[A-ZÁ-Ú][a-zá-ú])', '. ', n)   # "Eléctricos.Bebedero"
    n = re.sub(r'(Eléctricos): ?', r'\1: ', n)
    n = re.sub(r'(?<=\w)\.$', '', n) if not re.search(r'\b(etcétera|Inverter)\.$', n) else n
    return n

def expande(n):
    o = limpia(n)
    for p, r in REGLAS:
        if r is None: continue
        o = re.sub(p, r, o)
    o = re.sub(r'(\d)\.(\d)', r'\1,\2', o)              # decimales con coma
    o = re.sub(r'(\d+) ?(toneladas de refrigeración)', r'\1 \2', o)
    o = re.sub(r'\s+', ' ', o).strip()
    o = re.sub(r'(?<=[a-zñ]) ([,.])', r'\1', o)
    return o[:1].upper() + o[1:]

def codigo(x):
    c = x['codigoServicio']
    return c.split('-')[1] if c.count('-') >= 2 else c

cats = OrderedDict([('estatal', []), ('poblacion', [])]); modalidades = OrderedDict(); cambios = []; precio_ok = 0
importable = []; sin_proc = []
for x in fila:
    cod = codigo(x)
    cm, sm = S[cod]
    cat = x['categoria']; pob = cat == 'Población'
    clave = 'poblacion' if pob else 'estatal_interno'
    esperado = sm['tarifas'][clave]
    assert x['precioBase'] == esperado, (cod, x['precioBase'], esperado)
    precio_ok += 1
    nombre = expande(x['nombreServicio'])
    if nombre != re.sub(r'\s+', ' ', x['nombreServicio']).strip():
        cambios.append((cod, cat, x['nombreServicio'], nombre))
    mod = None if pob else re.sub(r'^Estatal - ', '', cat)
    if mod: modalidades.setdefault(mod, 0); modalidades[mod] += 1
    serv = {
        'codigo': cod, 'codigo_completo': x['codigoServicio'], 'descripcion': nombre,
        'unidad_medida': x['unidad'] or sm['unidad_medida'],
        'tarifas': {clave: esperado},
        'modalidad': mod,
        'modalidad_oficial': sm['modalidad'], 'tipo_servicio': sm['tipo_servicio'],
        'familia': cm['nombre_categoria'],
        'tiempo_estimado_minutos': x['tiempoEstimado'], 'cantidad_tecnicos': x['cantidadTecnicos'],
        'id_propietario': x['idPropietario'], 'detalle_factura': nombre if x['detalleFactura'] else None,
        'insumos_cup': x['insumosCUP'],
        'poblacion_coincidencia': sm.get('poblacion_coincidencia') if pob else None,
        'procedimiento': sm['procedimiento'],
    }
    if serv['procedimiento'] is None: sin_proc.append((cod, cat, nombre))
    cats['poblacion' if pob else 'estatal'].append(serv)
    fila_imp = dict(x); fila_imp['nombreServicio'] = nombre
    if fila_imp.get('detalleFactura'): fila_imp['detalleFactura'] = nombre
    importable.append(fila_imp)
out = {'version': modelo['version'], 'taller': 'Taller de Clima',
       'fuentes': ['gbottel-tarifario-taller-clima.json (base del taller)', 'tarifario_copextel.json (procedimientos oficiales, libro 70 Clima-Agua y otros)'],
       'categorias': [
           {'id_categoria': 'estatal', 'nombre_categoria': 'Estatal', 'aplica_a': ['Estatal', 'Interno'], 'tarifa': 'estatal_interno',
            'modalidades': list(modalidades), 'servicios': cats['estatal']},
           {'id_categoria': 'poblacion', 'nombre_categoria': 'Población', 'aplica_a': ['Población'], 'tarifa': 'poblacion',
            'modalidades': [], 'servicios': cats['poblacion']}]}
json.dump(out, open(sal, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
json.dump(importable, open(imp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
ncon = len(fila) - len(sin_proc)
with open(inf, 'w', encoding='utf-8') as f:
    f.write(f'# Conversión taller de clima\n\n- Filas: {len(fila)} · precios verificados idénticos al tarifario: {precio_ok}\n')
    f.write(f'- Categorías principales: Estatal ({len(cats["estatal"])}, sirve también a Interno) y Población ({len(cats["poblacion"])}).\n')
    f.write('- Modalidades (solo Estatal/Interno): ' + ', '.join(f'{k} ({v})' for k, v in modalidades.items()) + '\n')
    f.write(f'- Con procedimiento oficial: {ncon} · sin procedimiento: {len(sin_proc)}. Ningún libro de procedimientos trae bloque para estos códigos ni por nombre; no se inventan ni se heredan.\n')
    f.write(f'- Nombres modificados (abreviaturas y erratas): {len(cambios)}\n\n## Servicios sin procedimiento en los libros oficiales\n\n| Código | Categoría | Servicio |\n|---|---|---|\n')
    for c in sin_proc: f.write(f'| {c[0]} | {c[1]} | {c[2]} |\n')
    f.write('\n## Nombres modificados\n\n| Código | Categoría | Antes | Después |\n|---|---|---|---|\n')
    for c in cambios: f.write(f'| {c[0]} | {c[1]} | {c[2]} | {c[3]} |\n')
print(len(fila), precio_ok, len(cambios), ncon, len(sin_proc))
