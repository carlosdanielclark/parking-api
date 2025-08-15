// src/helpers/validate_helper.ts

/**
 * Obtiene una variable de entorno tipo string obligatoria.
 * Lanza error si no está definida o está vacía.
 */
export function getEnvString(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`La variable de entorno ${key} es obligatoria pero no está definida.`);
  }
  return value;
}

/**
 * Obtiene una variable de entorno tipo número obligatoria.
 * Lanza error si no está definida o no es un número válido.
 */
export function getEnvNumber(key: string): number {
  const value = process.env[key];
  if (!value) {
    throw new Error(`La variable de entorno ${key} es obligatoria pero no está definida.`);
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`La variable de entorno ${key} debe ser un número válido. Valor recibido: ${value}`);
  }
  return parsed;
}

/**
 * Obtiene una variable de entorno tipo string opcional con valor por defecto.
 */
export function getEnvStringOrDefault(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Obtiene una variable de entorno tipo número opcional con valor por defecto.
 * Si está definida debe ser un número válido, sino usa el valor por defecto.
 */
export function getEnvNumberOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`La variable de entorno ${key} debe ser un número válido. Valor recibido: ${value}`);
  }
  return parsed;
}
