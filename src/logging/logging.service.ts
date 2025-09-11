import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogLevel, LogAction } from '../schemas/log.schema';

/**
 * Servicio centralizado de logging para auditoría del sistema
 * Registra eventos críticos en MongoDB para trazabilidad
 */
@Injectable()
export class LoggingService {
  private readonly logger = new Logger(LoggingService.name);

  constructor(
    @InjectModel(Log.name) private logModel: Model<Log>,
  ) {}

  /**
   * Método genérico para registrar logs
   * Incluye manejo de errores con formato específico cuando falla ACCESS_LOGS
   */
  async log(
    level: LogLevel,
    action: LogAction,
    message: string,
    userId?: string,
    resource?: string,
    resourceId?: string,
    details?: any,
    context?: any,
  ): Promise<void> {
    try {
      const logEntry = new this.logModel({
        level,
        action,
        message,
        userId,
        resource,
        resourceId,
        details,
        context,
      });

      await logEntry.save();
      this.logger.debug(`Log registrado: ${action} - ${message}`);
    } catch (error) {
      // Formato requerido por especificaciones para errores al registrar accesos admin
      if (action === LogAction.ACCESS_LOGS) {
        this.logger.error(`[ERROR] Error logging admin access: ${error}`, (error as Error)?.stack);
      } else {
        this.logger.error(`Error al registrar log: ${(error as Error)?.message}`, (error as Error)?.stack);
      }
    }
  }

  /**
   * ✅ CORREGIDO: Registrar creación de reserva con mensaje consistente
   */
  async logReservationCreated(
    userId: string,
    reservaId: string,
    plazaId: number,
    vehiculoId: string,
    details?: any
  ): Promise<void> {
    await this.log(
      LogLevel.INFO,
      LogAction.CREATE_RESERVATION,
      `Reserva creada: ${reservaId} - Plaza ${plazaId}`, // ✅ CORREGIDO: mensaje consistente con test
      userId,
      'reserva',
      reservaId,
      {
        plazaId,
        vehiculoId,
        ...details
      }
    );
  }

  /**
   * Registrar cancelación de reserva
   */
  async logReservationCancelled(
    userId: string,
    reservaId: string,
    plazaId: number,
    details?: any
  ): Promise<void> {
    await this.log(
      LogLevel.INFO,
      LogAction.CANCEL_RESERVATION,
      `Reserva cancelada: ${reservaId} - Plaza ${plazaId}`,
      userId,
      'reserva',
      reservaId,
      {
        plazaId,
        ...details
      }
    );
  }

  /**
   * Registrar login de usuario
   */
  async logUserLogin(
    userId: string,
    email: string,
    context?: any
  ): Promise<void> {
    await this.log(
      LogLevel.INFO,
      LogAction.LOGIN,
      `Usuario autenticado: ${email}`,
      userId,
      'user',
      userId,
      { email },
      context
    );
  }

  /**
   * Registrar logout de usuario
   */
  async logUserLogout(
    userId: string,
    email: string,
    context?: any
  ): Promise<void> {
    await this.log(
      LogLevel.INFO,
      LogAction.LOGOUT,
      `Usuario cerró sesión: ${email}`,
      userId,
      'user',
      userId,
      { email },
      context
    );
  }

  /**
   * Método para cambio de rol
   */
  async logRoleChange(
    adminUserId: string,
    targetUserId: string,
    previousRole: string,
    newRole: string
  ): Promise<void> {
    await this.log(
      LogLevel.WARN,
      LogAction.ROLE_CHANGE, 
      `Administrator ${adminUserId} changed role of user ${targetUserId} from ${previousRole} to ${newRole}`,
      adminUserId,
      'user',
      targetUserId,
      {
        previousRole,
        newRole,
        changedBy: adminUserId,
        timestamp: new Date(),
      },
      { method: 'PATCH', resourceType: 'user_role', criticalOperation: true },
    );
  }

  /**
   * Registrar actualización de usuario
   */
  async logUserUpdated(
    adminUserId: string, 
    targetUserId: string, 
    previousState: any, 
    newState: any, 
    reason?: string
  ): Promise<void> {
    await this.log(
      LogLevel.INFO, 
      LogAction.UPDATE_USER, 
      `Administrador ${adminUserId} actualizó usuario ${targetUserId}`,
      adminUserId, 
      'user', 
      targetUserId, 
      { previousState, newState, reason, updated_by: adminUserId }, 
      { method: 'PATCH', resource_type: 'user', status: 'updated' }
    );
  }

  /**
   * Registrar acceso a logs — mensaje consistente con tests
   */
  async logLogAccess(
    adminUserId: string,
    queryParams: any
  ): Promise<void> {
    await this.log(
      LogLevel.INFO,
      LogAction.ACCESS_LOGS,
      `Administrador accedió a logs del sistema`,
      adminUserId,
      'logs',
      undefined,
      queryParams
    );
  }

  /**
   * Método para errores del sistema
   */
  async logSystemError(
    error: Error,
    context?: any,
    userId?: string
  ): Promise<void> {
    await this.log(
      LogLevel.ERROR,
      LogAction.SYSTEM_ERROR,
      `Error del sistema: ${error.message}`,
      userId,
      'system',
      undefined,
      {
        error: error.message,
        stackTrace: error.stack
      },
      context
    );
  }
}