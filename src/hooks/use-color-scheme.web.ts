import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const sinSuscripcion = () => () => {};

/**
 * Para que el render estático (SSR) no desajuste con el cliente, el
 * primer render en el navegador debe coincidir con lo que generó el
 * servidor ('light'). Antes esto se lograba con un setState dentro de
 * un useEffect al montar — el linter de hooks lo marca como error
 * porque dispara una re-renderización en cascada. useSyncExternalStore
 * es el hook pensado exactamente para este caso (valor que difiere
 * entre servidor y cliente) sin ese problema.
 */
export function useColorScheme() {
  const hidratado = useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false
  );
  const colorScheme = useRNColorScheme();
  return hidratado ? colorScheme : 'light';
}
