import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Enum que define los niveles de logging según severidad
 * - ERROR: Errores críticos que requieren atención inmediata
 * - WARN: Advertencias sobre situaciones potencialmente problemáticas  
 * - INFO: Información general sobre el funcionamiento del sistema
 * - DEBUG: Información detallada para depuración
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn', 
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * Enum que define los tipos de acciones registradas en el sistema
 * - LOGIN: Inicio de sesión de usuario
 * - LOGOUT: Cierre de sesión de usuario
 * - CREATE_RESERVATION: Creación de nueva reserva
 * - CANCEL_RESERVATION: Cancelación de reserva existente
 * - UPDATE_USER: Actualización de datos de usuario
 * - DELETE_USER: Eliminación de usuario
 * - ACCESS_LOGS: Acceso a logs del sistema
 * - PARKING_OCUPATION: Consulta de ocupación del parking
 * - ROLE_CHANGE: Cambio de rol de usuario
 * - SYSTEM_ERROR: Error del sistema
 */
export enum LogAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  CREATE_RESERVATION = 'create_reservation',
  CANCEL_RESERVATION = 'cancel_reservation', 
  UPDATE_USER = 'update_user',
  DELETE_USER = 'delete_user',
  ACCESS_LOGS = 'access_logs',
  PARKING_OCUPATION = 'parking_ocupation',
  ROLE_CHANGE = 'role_change',
  SYSTEM_ERROR = 'system_error'
}

/**
 * Subdocumento que contiene información contextual de la petición HTTP
 */
export class RequestContext {
  /**
   * Método HTTP utilizado (GET, POST, PUT, DELETE)
   */
  @Prop()
  method?: string;

  /**
   * URL completa de la petición
   */
  @Prop()
  url?: string;

  /**
   * Código de estado HTTP de la respuesta
   */
  @Prop()
  statusCode?: number;

  /**
   * Tiempo de respuesta en milisegundos
   */
  @Prop()
  responseTime?: number;

  /**
   * Dirección IP del cliente que realizó la petición
   */
  @Prop()
  ip?: string;

  /**
   * User-Agent del navegador o cliente
   */
  @Prop()
  userAgent?: string;
}

/**
 * Subdocumento que contiene detalles específicos del evento registrado
 */
export class LogDetails {
  /**
   * Estado anterior del recurso (para operaciones de actualización)
   */
  @Prop({ type: Object })
  previousState?: any;

  /**
   * Nuevo estado del recurso (para operaciones de creación/actualización)
   */
  @Prop({ type: Object })
  newState?: any;

  /**
   * Mensaje de error detallado (solo para eventos de error)
   */
  @Prop()
  error?: string;

  /**
   * Stack trace del error (para depuración)
   */
  @Prop()
  stackTrace?: string;

  /**
   * Datos adicionales relevantes para el evento
   */
  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

/**
 * Esquema principal para los logs del sistema
 * Almacena todos los eventos relevantes para auditoría y monitoreo
 */
@Schema({ 
  timestamps: true, // Agrega automáticamente createdAt y updatedAt
  collection: 'logs' // Nombre específico de la colección en MongoDB
})
export class Log extends Document {
  /**
   * Nivel de severidad del evento registrado
   * Determina la importancia y el tratamiento del log
   */
  @Prop({ 
    required: true,
    enum: LogLevel,
    default: LogLevel.INFO 
  })
  level: LogLevel;

  /**
   * Tipo de acción que generó este log
   * Permite categorizar y filtrar eventos específicos
   */
  @Prop({ 
    required: true,
    enum: LogAction 
  })
  action: LogAction;

  /**
   * Identificador del usuario que realizó la acción
   * Permite trazabilidad de acciones por usuario
   */
  @Prop()
  userId?: string;

  /**
   * Tipo de recurso afectado (usuario, reserva, plaza, vehículo)
   * Facilita la categorización y búsqueda de logs
   */
  @Prop()
  resource?: string;

  /**
   * Identificador específico del recurso afectado
   * Permite rastrear cambios en entidades específicas
   */
  @Prop()
  resourceId?: string;

  /**
   * Mensaje descriptivo del evento
   * Proporciona información legible sobre lo ocurrido
   */
  @Prop({ required: true })
  message: string;

  /**
   * Detalles específicos del evento registrado
   * Contiene información adicional contextual
   */
  @Prop({ type: LogDetails })
  details?: LogDetails;

  /**
   * Información contextual de la petición HTTP
   * Útil para análisis de rendimiento y debugging
   */
  @Prop({ type: RequestContext })
  context?: RequestContext;

  /**
   * Timestamp automático de creación (proporcionado por timestamps: true)
   */
  createdAt?: Date;

  /**
   * Timestamp automático de actualización (proporcionado por timestamps: true)  
   */
  updatedAt?: Date;
}

/**
 * Factory para crear el esquema de Mongoose
 * Configura índices para optimizar las consultas más frecuentes
 */
export const LogSchema = SchemaFactory.createForClass(Log);

// Índices para optimizar consultas frecuentes
LogSchema.index({ level: 1 });
LogSchema.index({ action: 1 });
LogSchema.index({ userId: 1 });
LogSchema.index({ resource: 1, resourceId: 1 });
LogSchema.index({ createdAt: -1 }); // Para ordenar por fecha descendente
LogSchema.index({ level: 1, createdAt: -1 }); // Índice compuesto para consultas por nivel y fecha