// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite en web usa wa-sqlite (WebAssembly). Sin declarar "wasm"
// como extensión de asset, Metro no empaqueta wa-sqlite.wasm y el build web falla.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// En Windows, desactivar Watchman evita el error "Failed to start watch mode".
if (process.platform === 'win32') {
  config.watcher = config.watcher || {};
  config.watcher.watchman = { enabled: false };
}

module.exports = config;