// En web el splash nativo no aplica (no hay pantalla de splash del SO),
// así que este overlay no tiene nada que animar. AnimatedIcon (que vivía
// acá antes con su glow y su gradiente) no se usa en ninguna pantalla —
// se quitó junto con las referencias a assets que solo él necesitaba.
export function AnimatedSplashOverlay(_props: { ready: boolean }) {
  return null;
}
