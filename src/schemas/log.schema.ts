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
 * ✅ AGREGADO: ROLE_CHANGE para resolver error crítico
 * ✅ AGREGADO: SYSTEM_ERROR para completar funcionalidad
 */
export enum LogAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  REGISTER = 'register',
  CREATE_RESERVATION = 'create_reservation',
  CANCEL_RESERVATION = 'cancel_reservation',
  UPDATE_USER = 'update_user',
  ROLE_CHANGE = 'role_change', // ✅ CRÍTICO: Agregado para resolver error
  CREATE_PLAZA = 'create_plaza',
  UPDATE_PLAZA = 'update_plaza', 
  DELETE_PLAZA = 'delete_plaza',
  ACCESS_LOGS = 'access_logs',
  SYSTEM_ERROR = 'system_error', // ✅ AGREGADO: Para LoggingService.logSystemError()
  PARKING_OCUPATION = 'parking_ocupation'
}

/**
 * Subdocumento que contiene información contextual de la petición HTTP
 */
export class RequestContext {
  @Prop()
  method?: string;

  @Prop()
  url?: string;

  @Prop()
  statusCode?: number;

  @Prop()
  responseTime?: number;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;
}

/**
 * Subdocumento que contiene detalles específicos del evento registrado
 */
export class LogDetails {
  @Prop({ type: Object })
  previousState?: any;

  @Prop({ type: Object })
  newState?: any;

  @Prop()
  error?: string;

  @Prop()
  stackTrace?: string;

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
  @Prop({ 
    required: true,
    enum: LogLevel,
    default: LogLevel.INFO 
  })
  level: LogLevel;

  @Prop({ 
    required: true,
    enum: LogAction 
  })
  action: LogAction;

  @Prop()
  userId?: string;

  @Prop()
  resource?: string;

  @Prop()
  resourceId?: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: LogDetails })
  details?: LogDetails;

  @Prop({ type: RequestContext })
  context?: RequestContext;

  createdAt?: Date;
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

