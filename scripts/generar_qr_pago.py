#!/usr/bin/env python3
"""Genera src/data/qrPagoTransfermovil.ts: matriz del QR ESTÁTICO de pago en línea
(Copextel Las Tunas). Contenido = el que traía el QR oficial impreso. Sin dependencias
en la app: la matriz va incrustada y se dibuja con react-native-svg."""
import json, segno
CONTENIDO = '{"id_transaccion":"ESTATICO","importe":"0","moneda":"CUP","numero_proveedor":"98841","version":"5","titulo":"Copextel Las Tunas"}'
q = segno.make(CONTENIDO, error='m', boost_error=False)
filas = [''.join('1' if c else '0' for c in f) for f in q.matrix]
n = len(filas)
cuerpo = ',\n  '.join(f"'{f}'" for f in filas)
open('src/data/qrPagoTransfermovil.ts', 'w', encoding='utf-8').write(
f"""// GENERADO por scripts/generar_qr_pago.py — no editar a mano.
// QR estático de pago en línea (Transfermóvil). Importe 0: el cliente escribe importe,
// número a confirmar y descripción en su teléfono.
export const QR_PAGO_CONTENIDO = {json.dumps(CONTENIDO, ensure_ascii=False)};
export const QR_PAGO_MODULOS: readonly string[] = [
  {cuerpo},
];
export const QR_PAGO_TAMANO = {n};
""")
print(n, 'módulos por lado')
