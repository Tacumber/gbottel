#!/usr/bin/env python3
"""Extrae los PROCEDIMIENTOS TÉCNICOS de los libros «NN Nombre 22.xlsx» a un JSON por servicio.

Uso: python3 scripts/extraer_procedimientos.py <carpeta_con_xlsx> [salida.json]
Cada bloque «PROCEDIMIENTO TÉCNICO» del libro aporta: modalidad, prestación, código, nº de técnicos,
actividades (nº, descripción, minutos), tiempo de solución técnica e insumos (código, producto, UM,
norma de consumo). NO se leen tarifas: los importes salen siempre del catálogo de la app.
"""
import glob, json, os, re, sys, unicodedata
import openpyxl

def txt(v):
    return ' '.join(str(v).split()) if v is not None else ''

def num(v):
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)): return v
    return None

def limpio(v):
    return v if v is not None and txt(v) != '' else None

def norm(s):
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()

def codigo4(v):
    if isinstance(v, float) and v.is_integer(): v = int(v)
    s = txt(v)
    if s.isdigit(): return s.zfill(4)
    return s

def sin_repetidos(f):
    """Celdas combinadas: el mismo texto puede venir repetido en celdas contiguas."""
    r = []
    for c in f:
        if r and isinstance(c, str) and isinstance(r[-1], str) and txt(c) == txt(r[-1]):
            continue
        r.append(c)
    return r

def buscar(f, prefijo):
    """Índice de la primera celda de texto cuyo valor normalizado empieza por `prefijo`."""
    for k, c in enumerate(f):
        if isinstance(c, str) and norm(txt(c)).startswith(prefijo):
            return k
    return -1

def siguiente(f, k):
    return f[k + 1] if 0 <= k and k + 1 < len(f) else None

def extraer_libro(ruta):
    wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    bloques = []
    for ws in wb.worksheets:
        filas = [sin_repetidos([c for c in r if limpio(c) is not None]) for r in ws.iter_rows(values_only=True)]
        i, n = 0, len(filas)
        while i < n:
            f = filas[i]
            if f and buscar(f, 'procedimiento tecnico') == 0 and len(f) == 1:
                b = {'hoja': ws.title, 'fila': i + 1, 'modalidad': None, 'prestacion': None, 'codigo': None, 'tecnicos': None,
                     'actividades': [], 'tiempo_minutos': None, 'insumos': []}
                i += 1
                estado = 'cab'
                while i < n:
                    f = filas[i]
                    if not f:
                        i += 1
                        continue
                    if len(f) == 1 and buscar(f, 'procedimiento tecnico') == 0:
                        break
                    k_mod = buscar(f, 'modalidad de servicio')
                    k_pre = buscar(f, 'prestacion especifica')
                    k_cod = buscar(f, 'codigo prestacion')
                    k_no = buscar(f, 'no.') if any(isinstance(c, str) and norm(txt(c)) == 'no.' for c in f) else -1
                    k_tie = buscar(f, 'tiempo de solucion')
                    k_ins = -1
                    for k, c in enumerate(f):
                        if isinstance(c, str) and norm(txt(c)) == 'codigo' and any(isinstance(d, str) and norm(txt(d)) == 'producto' for d in f[k + 1:]):
                            k_ins = k
                    if k_mod >= 0:
                        b['modalidad'] = txt(siguiente(f, k_mod)) or None
                    elif k_pre >= 0:
                        b['prestacion'] = txt(siguiente(f, k_pre)) or None
                    elif k_cod >= 0:
                        b['codigo'] = codigo4(siguiente(f, k_cod))
                        k_tec = buscar(f, 'cantidad de tecnicos')
                        if k_tec >= 0:
                            b['tecnicos'] = num(siguiente(f, k_tec))
                    elif k_no >= 0:
                        estado = 'act'
                    elif k_tie >= 0:
                        v = [num(c) for c in f[k_tie + 1:] if num(c) is not None]
                        b['tiempo_minutos'] = v[0] if v else None
                        estado = 'tiempo'
                    elif k_ins >= 0:
                        estado = 'ins_cab'
                    elif estado == 'ins_cab':
                        estado = 'ins'  # fila de subencabezados (UM, norma de consumo, precios...)
                    elif estado == 'act':
                        s0 = next((k for k, c in enumerate(f) if isinstance(c, str)), -1)
                        if s0 >= 1 and num(f[s0 - 1]) is not None:
                            mins = [num(c) for c in f[s0 + 1:] if num(c) is not None]
                            b['actividades'].append({'n': int(num(f[s0 - 1])), 'actividad': txt(f[s0]), 'minutos': mins[-1] if mins else None})
                    elif estado == 'ins':
                        if buscar(f, 'nota') == 0:
                            estado = 'fin'
                        else:
                            ss = [c for c in f if isinstance(c, str)]
                            nn = [num(c) for c in f if num(c) is not None]
                            if len(ss) >= 3 and nn:
                                b['insumos'].append({'codigo': txt(ss[0]), 'producto': txt(ss[1]), 'um': txt(ss[2]), 'norma_consumo': nn[0]})
                    i += 1
                bloques.append(b)
                continue
            i += 1
    return bloques

def main():
    carpeta = sys.argv[1]
    salida = sys.argv[2] if len(sys.argv) > 2 else 'procedimientos_servicios.json'
    todos = []
    for ruta in sorted(glob.glob(os.path.join(carpeta, '**', '*.xlsx'), recursive=True)):
        bl = extraer_libro(ruta)
        for b in bl: b['libro'] = os.path.basename(ruta)
        print(f'{os.path.basename(ruta)}: {len(bl)} procedimientos')
        todos.extend(bl)
    json.dump({'procedimientos': todos}, open(salida, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('TOTAL', len(todos), '->', salida)

if __name__ == '__main__':
    main()
