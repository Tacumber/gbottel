import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Captura errores JavaScript de renderizado para evitar una pantalla blanca.
 * No puede capturar SIGSEGV/abort nativos: esos deben investigarse con
 * logcat/Xcode y, precisamente por eso, el arranque mantiene la superficie
 * nativa al mínimo.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[GBOTtel] React ErrorBoundary:', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>GBOTtel encontró un error</Text>
        <Text style={styles.message}>{this.state.message || 'Error inesperado.'}</Text>
        <Pressable onPress={this.reset} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F5F5F5' },
  title: { fontSize: 22, fontWeight: '700', color: '#111111', textAlign: 'center' },
  message: { marginTop: 10, maxWidth: 620, color: '#5A5A5A', textAlign: 'center', lineHeight: 20 },
  button: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: '#B11226' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
