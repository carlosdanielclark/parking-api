// Archivo: test/helpers/log/log-util.ts
// MANTENIDO - Sistema de logging estable para tests
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

/**
 * NUEVO: Logger especializado para métricas de performance
 */
export function logPerformance(
  operacion: string, 
  duracionMs: number, 
  metadata?: any
) {
  const emoji = duracionMs < 1000 ? '⚡' : duracionMs < 5000 ? '⏱️' : '🐌';
  
  logStepV3(
    `${operacion} completada en ${duracionMs}ms`, 
    { etiqueta: 'PERF', tipo: 'info' },
    { duracionMs, ...metadata }
  );
}

/**
 * NUEVO: Logger para transiciones de estado
 */
export function logStateTransition(
  entidad: string,
  id: string | number,
  estadoAnterior: string,
  estadoNuevo: string
) {
  logStepV3(
    `${entidad} ${id}: ${estadoAnterior} → ${estadoNuevo}`,
    { etiqueta: 'STATE', tipo: 'info' }
  );
}

/**
 * NUEVO: Logger para operaciones de red/HTTP
 */
export function logHttpRequest(
  method: string,
  path: string,
  status: number,
  duracionMs?: number
) {
  const emoji = status >= 200 && status < 300 ? '✅' : status >= 400 ? '❌' : '⚠️';
  const duracion = duracionMs ? ` (${duracionMs}ms)` : '';
  
  logStepV3(
    `${emoji} ${method} ${path} → ${status}${duracion}`,
    { etiqueta: 'HTTP', tipo: status >= 400 ? 'error' : 'info' }
  );
}

/**
 * NUEVO: Logger para limpieza y setup
 */
export function logCleanupOperation(
  operacion: string,
  entidadesAfectadas: number,
  tipo: 'setup' | 'cleanup' = 'cleanup'
) {
  const emoji = tipo === 'setup' ? '🔧' : '🧹';
  
  logStepV3(
    `${emoji} ${operacion}: ${entidadesAfectadas} entidades`,
    { etiqueta: tipo.toUpperCase(), tipo: 'info' }
  );
}

/**
 * NUEVO: Logger para debugging de unicidad
 */
export function logUniquenessDebug(
  tipo: 'plaza' | 'placa',
  generado: string,
  intentos: number,
  usado: number
) {
  logStepV3(
    `Generado ${tipo}: ${generado} (intento ${intentos}, total usado: ${usado})`,
    { etiqueta: 'UNIQUE', tipo: 'info' }
  );
}