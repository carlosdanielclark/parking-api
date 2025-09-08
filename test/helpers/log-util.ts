// test/helpers/log-util.ts
export interface LogOptions {
  tipo?: 'info' | 'error' | 'warning';
  etiqueta?: string;
}

/**
 * logStepV3 - versión estable y defensiva
 * - mensaje: cualquier valor (string, objeto)
 * - options: { tipo, etiqueta }
 * - datos: opcional, puede ser objeto/array para imprimir adicionalmente
 */
export function logStepV3(mensaje: any, options: LogOptions = {}, datos?: any) {
  const config = {
    tipo: options.tipo || 'info',
    etiqueta: options.etiqueta || 'TEST'
  };

  const iconos: Record<string, string> = {
    info: '🟢',
    error: '🔴',
    warning: '🟡'
  };

  const niveles: Record<string, string> = {
    info: 'LOG',
    error: 'ERROR',
    warning: 'WARNING'
  };

  if (datos !== undefined) {
    console.log(`${iconos[config.tipo]} [${config.etiqueta} ${niveles[config.tipo]}]:`, mensaje, datos);
  } else {
    // Mensaje simple
    console.log(`${iconos[config.tipo]} [${config.etiqueta} ${niveles[config.tipo]}]: ${mensaje}`);
  }
}

