import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

const DURATION = 600;

/**
 * Overlay de transición sobre el splash nativo.
 *
 * Antes usaba react-native-reanimated (Keyframe + un callback 'worklet'
 * que cruzaba al hilo de JS con scheduleOnRN). Un crash nativo reportado
 * justo al mostrarse el logo, con libworklets.so en el stack de la traza,
 * coincide exactamente con ese único punto del código que tocaba
 * worklets — es la única pantalla de toda la app que los usaba. En vez
 * de perseguir el bug exacto dentro de una librería nativa sin poder
 * instrumentar el dispositivo real, se saca el riesgo de raíz: esto usa
 * el Animated de React Native "core" (no Reanimated), que no pasa por
 * libworklets.so en absoluto. useNativeDriver:true igual corre la
 * animación en el hilo nativo — sigue siendo fluida, solo que por el
 * camino viejo y sobradamente probado, no por el de worklets.
 */
export function AnimatedSplashOverlay({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().finally(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    });
  }, [ready, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.splashOverlay, { opacity }]}>
      <Image style={styles.image} source={require('@/assets/images/splash-icon.png')} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: 84,
    height: 84,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
