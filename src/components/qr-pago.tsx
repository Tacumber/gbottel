import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { QR_PAGO_MODULOS, QR_PAGO_TAMANO } from '@/data/qrPagoTransfermovil';

/** QR estático de pago en línea, dibujado desde la matriz incrustada (sin Internet). Siempre negro sobre blanco. */
export function QRPago({ tamano = 260 }: { tamano?: number }) {
  const margen = 4;
  const lado = QR_PAGO_TAMANO + margen * 2;
  const trazo = useMemo(() => {
    const partes: string[] = [];
    QR_PAGO_MODULOS.forEach((fila, y) => {
      let x = 0;
      while (x < fila.length) {
        if (fila[x] !== '1') { x++; continue; }
        let fin = x;
        while (fin < fila.length && fila[fin] === '1') fin++;
        partes.push(`M${x + margen} ${y + margen}h${fin - x}v1h${x - fin}z`);
        x = fin;
      }
    });
    return partes.join('');
  }, []);
  return (
    <Svg width={tamano} height={tamano} viewBox={`0 0 ${lado} ${lado}`} accessibilityLabel="Código QR de pago en línea">
      <Rect x={0} y={0} width={lado} height={lado} fill="#FFFFFF" />
      <Path d={trazo} fill="#000000" />
    </Svg>
  );
}
