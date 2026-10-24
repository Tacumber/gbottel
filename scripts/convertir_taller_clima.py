#!/usr/bin/env python3
"""Convierte la base del taller de clima (formato antiguo, 200 filas) al modelo unificado
(src/data/tarifario_copextel.json), expandiendo abreviaturas. Los precios se copian sin tocar.
Uso: convertir_taller_clima.py <entrada.json> <salida.json> <informe.md>"""
import json, re, sys, unicodedata
from collections import OrderedDict

ent, sal, inf = sys.argv[1:4]
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

cats = OrderedDict(); cambios = []; precio_ok = 0
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
    cname = 'Población' if pob else re.sub(r'^Estatal - ', '', cat)
    cats.setdefault(cname, []).append({
        'codigo': cod, 'codigo_completo': x['codigoServicio'], 'descripcion': nombre,
        'unidad_medida': x['unidad'] or sm['unidad_medida'],
        'tarifas': {clave: esperado}, 'tipo_tarifa': 'poblacion' if pob else 'estatal_interno',
        'modalidad': sm['modalidad'], 'tipo_servicio': sm['tipo_servicio'],
        'tiempo_estimado_minutos': x['tiempoEstimado'], 'cantidad_tecnicos': x['cantidadTecnicos'],
        'id_propietario': x['idPropietario'], 'detalle_factura': x['detalleFactura'] or None,
        'procedimiento': sm['procedimiento'],
    })
out = {'version': modelo['version'], 'taller': 'Taller de Clima',
       'fuente': 'gbottel-tarifario-taller-clima.json (formato antiguo) + tarifario_copextel.json',
       'categorias': [{'id_categoria': i + 1, 'nombre_categoria': k, 'servicios': v}
                      for i, (k, v) in enumerate(cats.items())]}
json.dump(out, open(sal, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
with open(inf, 'w', encoding='utf-8') as f:
    f.write(f'# Conversión taller de clima\n\n- Filas: {len(fila)} · precios verificados idénticos: {precio_ok}\n')
    f.write(f'- Nombres modificados: {len(cambios)}\n\n| Código | Categoría | Antes | Después |\n|---|---|---|---|\n')
    for c in cambios: f.write(f'| {c[0]} | {c[1]} | {c[2]} | {c[3]} |\n')
print(len(fila), precio_ok, len(cambios))
