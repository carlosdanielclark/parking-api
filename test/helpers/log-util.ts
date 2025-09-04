// test/helpers/log-util.ts
export interface LogOptions {
  tipo?: 'info' | 'error' | 'warning';
  etiqueta?: string;
}

export function logStepV3(mensaje: any, options: LogOptions = {}, ...datos: any[]) {
  const config = {
      tipo: options.tipo || 'info',
      etiqueta: options.etiqueta || 'TEST'
  };
  const iconos = {
      info: '🟢',
      error: '🔴',
      warning: '🟡'
  };
  const niveles = {
      info: 'LOG',
      error: 'ERROR',
      warning: 'WARNING'
  };
  console.log(
      `${iconos[config.tipo]} [${config.etiqueta} ${niveles[config.tipo]}]: ${mensaje}`,
      ...datos
  );
}
