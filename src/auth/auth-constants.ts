/**
 * Constantes de configuración para el módulo de autenticación JWT
 * Centraliza la configuración de seguridad y tokens
 */

/**
 * Configuración de constantes JWT
 * Define el secreto para firma de tokens con fallback de seguridad
 */
export const jwtConstants = {
  /**
   * Clave secreta para firmar tokens JWT
   * En producción debe ser una clave robusta y única
   */
  secret: process.env.JWT_SECRET || 'fallback_secret_key_change_in_production',
};

/**
 * Configuración adicional de autenticación
 */
export const authConstants = {
  /**
   * Número de rondas para el hash de bcrypt
   * Balance entre seguridad y rendimiento
   */
  saltRounds: 10,
  
  /**
   * Prefijo para tokens en headers de autorización
   */
  tokenPrefix: 'Bearer',
  
  /**
   * Tiempo de expiración por defecto para tokens JWT (en segundos)
   */
  defaultExpirationTime: 3600, // 1 hora
};