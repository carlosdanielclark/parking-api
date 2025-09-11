import { 
  Controller, 
  Get, 
  Query, 
  UseGuards, 
  Res, 
  HttpStatus, 
  BadRequestException,
  ParseIntPipe,
  HttpCode,
  Logger
} from '@nestjs/common';
import express from 'express';
import { LogsQueryService } from '../services/logs-query.service';
import { LogsExportService } from '../services/logs-export.service';
import { LogsQueryDto } from '../dto/logs-query.dto';
import { ExportLogsDto } from '../dto/export-logs.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/get-user.decorator';
import { UserRole } from '../../entities/user.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LoggingService } from '../../logging/logging.service';
import { LogAction, LogLevel } from '../../schemas/log.schema';

/**
 * Controlador para endpoints administrativos de logs
 * Caso de uso: Administrador desea acceder a logs de actividad del parking
 * Acceso exclusivo para usuarios con rol ADMIN
 */
@Controller('admin/logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLogsController {
  private readonly logger = new Logger(AdminLogsController.name);

  constructor(
    private readonly logsQueryService: LogsQueryService,
    private readonly logsExportService: LogsExportService,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Obtener logs del sistema con filtros avanzados
   * Endpoint: GET /admin/logs
   * Incluye paginación, filtros múltiples y resumen estadístico
   * 
   * @param queryDto Parámetros de consulta y filtros
   * @param currentUser Administrador autenticado
   * @returns Logs paginados con metadatos
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getLogs(
    @Query() queryDto: LogsQueryDto,
    @GetUser() currentUser: AuthenticatedUser,
  ) {
    this.logger.log(`Administrador ${currentUser.userId} consultando logs del sistema`);
    
    try {
      const result = await this.logsQueryService.queryLogs(queryDto, currentUser.userId);
      
      this.logger.log(`Consulta exitosa: ${result.logs.length} logs de ${result.pagination.total} total`);
      
      return {
        success: true,
        message: 'Logs obtenidos exitosamente',
        logs: result.logs,
        pagination: result.pagination,
        summary: result.summary,
        filters: result.filters,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error(`Error en consulta de logs: ${error.message}`, error.stack);
      
      // Registrar error para auditoría
      /*
      comentar el loggingService.log dentro de getLogs si se conserva middleware
      await this.loggingService.log(
          LogLevel.ERROR,
          LogAction.SYSTEM_ERROR,
        `Error en consulta administrativa de logs: ${error.message}`,
        currentUser.userId,
        'admin_logs',
        undefined,
        { error: error.message, queryParams: queryDto },
        { method: 'GET', resource_type: 'admin_logs_error' }
      );
      */
      
      throw error;
    }
  }

  /**
   * Obtener estadísticas de logs por periodo
   * Endpoint: GET /admin/logs/statistics
   * Para dashboards y análisis de tendencias
   * 
   * @param days Número de días para el análisis
   * @param currentUser Administrador autenticado
   * @returns Estadísticas agregadas por fecha y nivel
   */
  @Get('statistics')
  @HttpCode(HttpStatus.OK)
  async getLogStatistics(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 30,
    @GetUser() currentUser: AuthenticatedUser,
  ) {
    this.logger.log(`Administrador ${currentUser.userId} solicitando estadísticas de ${days} días`);
    
    try {
      // Validar rango de días
      if (days < 1 || days > 365) {
        throw new BadRequestException('El número de días debe estar entre 1 y 365');
      }

      const statistics = await this.logsQueryService.getLogStatistics(days);
      
      // Registrar acceso a estadísticas
      await this.loggingService.log(
        LogLevel.INFO,
        LogAction.ACCESS_LOGS,
        `Administrador accedió a estadísticas de logs`,
        currentUser.userId,
        'log_statistics',
        undefined,
        { days_requested: days, statistics_count: statistics.length },
        { method: 'GET', resource_type: 'log_statistics' }
      );
      
      this.logger.log(`Estadísticas generadas para ${statistics.length} días`);
      
      return {
        success: true,
        message: 'Estadísticas de logs obtenidas exitosamente',
        data: statistics,
        metadata: {
          period: `${days} días`,
          generatedAt: new Date().toISOString(),
          dataPoints: statistics.length,
        },
      };

    } catch (error) {
      this.logger.error(`Error obteniendo estadísticas: ${error.message}`, error.stack);
      
      await this.loggingService.log(
        LogLevel.ERROR,
        LogAction.SYSTEM_ERROR,
        `Error obteniendo estadísticas de logs: ${error.message}`,
        currentUser.userId,
        'log_statistics',
        undefined,
        { error: error.message, days: days },
        { method: 'GET', resource_type: 'log_statistics_error' }
      );
      
      throw error;
    }
  }

  /**
   * Obtener eventos críticos recientes
   * Endpoint: GET /admin/logs/critical
   * Para monitoreo de seguridad y alertas
   * 
   * @param hours Número de horas hacia atrás para buscar
   * @param currentUser Administrador autenticado
   * @returns Lista de eventos críticos
   */
  @Get('critical')
  @HttpCode(HttpStatus.OK)
  async getCriticalEvents(
    @Query('hours', new ParseIntPipe({ optional: true })) hours: number = 24,
    @GetUser() currentUser: AuthenticatedUser,
  ) {
    this.logger.log(`Administrador ${currentUser.userId} consultando eventos críticos de ${hours} horas`);
    
    try {
      // Validar rango de horas
      if (hours < 1 || hours > 168) { // Máximo 1 semana
        throw new BadRequestException('El número de horas debe estar entre 1 y 168');
      }

      const criticalEvents = await this.logsQueryService.getCriticalEvents(hours);
      
      // Registrar acceso a eventos críticos
      await this.loggingService.log(
        LogLevel.WARN,
        LogAction.ACCESS_LOGS,
        `Administrador consultó eventos críticos del sistema`,
        currentUser.userId,
        'critical_events',
        undefined,
        { hours_requested: hours, events_found: criticalEvents.length },
        { method: 'GET', resource_type: 'critical_events_access', critical_operation: true }
      );
      
      this.logger.log(`Se encontraron ${criticalEvents.length} eventos críticos`);
      
      return {
        success: true,
        message: 'Eventos críticos obtenidos exitosamente',
        data: criticalEvents,
        metadata: {
          period: `${hours} horas`,
          count: criticalEvents.length,
          generatedAt: new Date().toISOString(),
          alertLevel: criticalEvents.length > 50 ? 'HIGH' : criticalEvents.length > 10 ? 'MEDIUM' : 'LOW',
        },
      };

    } catch (error) {
      this.logger.error(`Error obteniendo eventos críticos: ${error.message}`, error.stack);
      
      await this.loggingService.log(
        LogLevel.ERROR,
        LogAction.SYSTEM_ERROR,
        `Error obteniendo eventos críticos: ${error.message}`,
        currentUser.userId,
        'critical_events',
        undefined,
        { error: error.message, hours: hours },
        { method: 'GET', resource_type: 'critical_events_error' }
      );
      
      throw error;
    }
  }

  /**
   * Exportar logs en diferentes formatos
   * Endpoint: GET /admin/logs/export
   * Soporta CSV, JSON y Excel con límites de seguridad
   * 
   * @param exportDto Configuración de exportación
   * @param response Objeto de respuesta HTTP
   * @param currentUser Administrador autenticado
   */
  @Get('export')
  async exportLogs(
    @Query() exportDto: ExportLogsDto,
    @Res() response: express.Response,
    @GetUser() currentUser: AuthenticatedUser,
  ) {
    this.logger.log(`Administrador ${currentUser.userId} exportando logs en formato ${exportDto.format}`);
    
    try {
      // Validar formato requerido
      if (!exportDto.format) {
        throw new BadRequestException('El formato de exportación es requerido');
      }

      // Registrar intento de exportación (operación crítica)
      await this.loggingService.log(
        LogLevel.WARN,
        LogAction.ACCESS_LOGS,
        `Administrador inició exportación de logs del sistema`,
        currentUser.userId,
        'log_export',
        undefined,
        { 
          export_format: exportDto.format,
          filters: exportDto,
          max_records: exportDto.maxRecords,
          timestamp: new Date(),
        },
        { 
          method: 'GET', 
          resource_type: 'log_export_attempt',
          critical_operation: true 
        }
      );

      const exportResult = await this.logsExportService.exportLogs(exportDto);
      
      // Configurar headers de respuesta para descarga
      response.setHeader('Content-Type', exportResult.mimeType);
      response.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      
      if (typeof exportResult.data === 'string') {
        response.setHeader('Content-Length', Buffer.byteLength(exportResult.data, 'utf8'));
      } else {
        response.setHeader('Content-Length', exportResult.data.length);
      }
      
      // Enviar archivo
      response.status(HttpStatus.OK).send(exportResult.data);
      
      // Registrar exportación exitosa
      await this.loggingService.log(
        LogLevel.INFO,
        LogAction.ACCESS_LOGS,
        `Exportación de logs completada exitosamente`,
        currentUser.userId,
        'log_export',
        undefined,
        { 
          filename: exportResult.filename,
          format: exportDto.format,
          success: true,
          file_size: typeof exportResult.data === 'string' 
            ? Buffer.byteLength(exportResult.data, 'utf8')
            : exportResult.data.length,
        },
        { 
          method: 'GET', 
          resource_type: 'log_export_success',
          status_code: 200 
        }
      );
      
      this.logger.log(`Exportación exitosa: ${exportResult.filename}`);
      
    } catch (error) {
      this.logger.error(`Error en exportación: ${error.message}`, error.stack);
      
      // Registrar error de exportación
      await this.loggingService.log(
        LogLevel.ERROR,
        LogAction.SYSTEM_ERROR,
        `Error en exportación de logs: ${error.message}`,
        currentUser.userId,
        'log_export',
        undefined,
        { 
          error: error.message,
          exportParams: exportDto,
          failed_operation: true,
        },
        { method: 'GET', resource_type: 'log_export_error' }
      );
      
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Error al exportar logs',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Verificar salud del sistema de logs
   * Endpoint: GET /admin/logs/health
   * Para monitoreo y diagnóstico del sistema
   * 
   * @param currentUser Administrador autenticado
   * @returns Estado de salud del sistema de logs
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getLogsHealth(@GetUser() currentUser: AuthenticatedUser) {
    this.logger.log(`Administrador ${currentUser.userId} verificando salud del sistema de logs`);
    
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
      
      // Consultar logs recientes para verificar actividad
      const recentLogsQuery = await this.logsQueryService.queryLogs({
        startDate: oneHourAgo.toISOString(),
        endDate: now.toISOString(),
        limit: 10,
        offset: 0,
      }, currentUser.userId);
      
      // Obtener eventos críticos recientes
      const criticalEvents = await this.logsQueryService.getCriticalEvents(1);
      
      // Determinar estado de salud
      const logsInLastHour = recentLogsQuery.pagination.total;
      const criticalEventsCount = criticalEvents.length;
      
      let systemStatus = 'healthy';
      if (criticalEventsCount > 50) {
        systemStatus = 'critical';
      } else if (criticalEventsCount > 10) {
        systemStatus = 'warning';
      } else if (logsInLastHour === 0) {
        systemStatus = 'warning'; // Puede indicar problemas en el logging
      }

      const healthData = {
        systemHealth: {
          status: systemStatus,
          logsInLastHour,
          criticalEventsInLastHour: criticalEventsCount,
          lastLogTimestamp: recentLogsQuery.logs.length > 0 
            ? recentLogsQuery.logs[0].createdAt 
            : undefined,
          recommendations: this.getHealthRecommendations(systemStatus, logsInLastHour, criticalEventsCount),
        },
        checkTimestamp: now.toISOString(),
        performedBy: currentUser.userId,
      };

      // Registrar verificación de salud
      await this.loggingService.log(
        LogLevel.INFO,
        LogAction.ACCESS_LOGS,
        `Verificación de salud del sistema de logs`,
        currentUser.userId,
        'system_health',
        undefined,
        { 
          health_status: systemStatus,
          logs_last_hour: logsInLastHour,
          critical_events: criticalEventsCount,
        },
        { method: 'GET', resource_type: 'system_health_check' }
      );
      
      return {
        success: true,
        message: 'Estado de salud del sistema obtenido exitosamente',
        data: healthData,
      };

    } catch (error) {
      this.logger.error(`Error verificando salud del sistema: ${error.message}`, error.stack);
      
      await this.loggingService.log(
        LogLevel.ERROR,
        LogAction.SYSTEM_ERROR,
        `Error en verificación de salud del sistema: ${error.message}`,
        currentUser.userId,
        'system_health',
        undefined,
        { error: error.message },
        { method: 'GET', resource_type: 'system_health_error' }
      );
      
      throw error;
    }
  }

  /**
   * Generar recomendaciones basadas en el estado de salud
   * 
   * @param status Estado actual del sistema
   * @param logsCount Número de logs en la última hora
   * @param criticalCount Número de eventos críticos
   * @returns Array de recomendaciones
   */
  private getHealthRecommendations(status: string, logsCount: number, criticalCount: number): string[] {
    const recommendations: string[] = [];

    if (status === 'critical') {
      recommendations.push('⚠️ Sistema en estado crítico - Revisar eventos inmediatamente');
      recommendations.push('🔍 Analizar logs de errores y tomar acciones correctivas');
    }

    if (status === 'warning') {
      if (criticalCount > 10) {
        recommendations.push('⚡ Alto número de eventos críticos - Monitorear de cerca');
      }
      if (logsCount === 0) {
        recommendations.push('📝 No hay logs recientes - Verificar sistema de logging');
      }
    }

    if (criticalCount > 0) {
      recommendations.push('🔎 Revisar eventos críticos en la sección correspondiente');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Sistema funcionando correctamente');
    }

    return recommendations;
  }
}