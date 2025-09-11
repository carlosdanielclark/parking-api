// src/admin/services/logs-query.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogAction, LogLevel } from '../../schemas/log.schema';
import { LogsQueryDto } from '../dto/logs-query.dto';
import { LoggingService } from '../../logging/logging.service';

/**
 * Interface para la respuesta de consulta de logs
 */
export interface LogsResponse {
  logs: Log[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  filters: LogsQueryDto;
  summary: {
    errorCount: number;
    warnCount: number;
    infoCount: number;
    debugCount: number;
    uniqueUsers: number;
    dateRange: {
      oldest: Date | null;
      newest: Date | null;
    };
  };
}

/**
 * Servicio especializado para consultas avanzadas de logs administrativos
 * Implementa filtrado, paginación, búsqueda y análisis estadístico
 */
@Injectable()
export class LogsQueryService {
  private readonly logger = new Logger(LogsQueryService.name);

  constructor(
    @InjectModel(Log.name) 
    private readonly logModel: Model<Log>,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * ✅ CORREGIDO: Ejecuta consulta de logs con filtros avanzados y paginación corregida
   */
  async queryLogs(queryDto: LogsQueryDto, adminUserId: string): Promise<LogsResponse> {
    this.logger.log(`Administrador ${adminUserId} consultando logs con filtros: ${JSON.stringify(queryDto)}`);

    try {
      await this.loggingService.log(
        LogLevel.INFO,
        LogAction.ACCESS_LOGS,
        `Administrador accedió a logs del sistema`,
        adminUserId,
        'logs',
        undefined,
        { queryFilters: queryDto, timestamp: new Date() },
        { method: 'GET', resource_type: 'admin_logs_query', admin_operation: true }
      );

      const mongoQuery = this.buildMongoQuery(queryDto);
      this.logger.debug(`Query MongoDB construida: ${JSON.stringify(mongoQuery)}`);

      // ✅ CORREGIDO: Paginación consistente
      const page = queryDto.page || 1;
      const limit = queryDto.limit || 50;
      const skip = (page - 1) * limit; // ✅ USAR skip directamente

      const [logs, total, summary] = await Promise.all([
        this.executeLogsQuery(mongoQuery, { ...queryDto, limit, skip }), // ✅ CORREGIDO
        this.logModel.countDocuments(mongoQuery),
        this.generateSummary(mongoQuery),
      ]);

      const totalPages = Math.ceil(total / limit);

      const response: LogsResponse = {
        logs,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
        filters: queryDto,
        summary,
      };

      this.logger.log(`Consulta completada: ${logs.length} logs de ${total} total`);
      return response;

    } catch (error) {
      this.logger.error(`Error en consulta de logs: ${error.message}`, error.stack);
      await this.loggingService.log(
        LogLevel.ERROR,
        LogAction.SYSTEM_ERROR,
        `Error en consulta de logs administrativos: ${error.message}`,
        adminUserId,
        'logs',
        undefined,
        { error: error.message, queryParams: queryDto },
        { method: 'GET', resource_type: 'admin_logs_error' }
      );
      throw new BadRequestException('Error interno al consultar logs');
    }
  }

  /**
   * ✅ CORREGIDO: Construye la consulta MongoDB con filtros estrictos y exclusiones
   * 1) Filtro estricto por action, 2) exclusión opcional de auto-logs de consulta,
   * 3) orden estable (createdAt + _id) para paginación determinista
   */
    private buildMongoQuery(queryDto: LogsQueryDto): any {
      const query: any = {};

      if (queryDto.level) query.level = queryDto.level;
      if (queryDto.action) {
        // ✅ NUEVO: Filtro especial para acciones de reserva
        if (queryDto.action === 'reserva_actions') {
          query.action = { 
            $in: [
              LogAction.CREATE_RESERVATION, 
              LogAction.CANCEL_RESERVATION, 
              LogAction.FINISH_RESERVATION
            ]
          };
        } else {
          query.action = queryDto.action;
        }
      }
      if (queryDto.userId) query.userId = queryDto.userId;
      if (queryDto.resource) query.resource = queryDto.resource;
      if (queryDto.resourceId) query.resourceId = queryDto.resourceId;
      if (queryDto.ip) query['context.ip'] = queryDto.ip;

      if (queryDto.startDate || queryDto.endDate) {
        query.createdAt = {};
        if (queryDto.startDate) query.createdAt.$gte = new Date(queryDto.startDate);
        if (queryDto.endDate) query.createdAt.$lte = new Date(queryDto.endDate);
      }

      // ✅ CORREGIDO: Mantener búsqueda, pero si hay action, no mezclar por OR a menos que coincida
      // Dejar búsqueda como fallback cuando no hay action
      if (queryDto.search) {
        if (!queryDto.action) {
          query.$or = [
            { message: { $regex: queryDto.search, $options: 'i' } },
            { 'details.error': { $regex: queryDto.search, $options: 'i' } },
            { 'details.reason': { $regex: queryDto.search, $options: 'i' } },
            { 'context.userAgent': { $regex: queryDto.search, $options: 'i' } },
            { userId: { $regex: queryDto.search, $options: 'i' } },
            { resourceId: { $regex: queryDto.search, $options: 'i' } },
          ];
        }
      }

      // ✅ CORREGIDO: Exclusión de auto-logs de consulta (opcional, activada por el controller)
      // Solo excluir si no se está filtrando por una acción específica
      if ((queryDto as any).__excludeAdminAccessQuery && !queryDto.action) {
        query['context.resource_type'] = { $ne: 'admin_logs_query' };
      }

      return query;
    }


  /**
   * ✅ CORREGIDO: Método executeLogsQuery actualizado con orden estable
   */
  private async executeLogsQuery(mongoQuery: any, queryDto: Partial<LogsQueryDto>): Promise<Log[]> {
    const sortBy = queryDto.sortBy || 'createdAt';
    const sortOrder = queryDto.sortOrder === 'asc' ? 1 : -1;

    // ✅ CORREGIDO: Orden estable - si se ordena por createdAt, añadir _id como segundo criterio
    const sortOptions: Record<string, 1 | -1> = {};
    if (sortBy === 'createdAt') {
      sortOptions['createdAt'] = sortOrder;
      sortOptions['_id'] = sortOrder;
    } else {
      sortOptions[sortBy] = sortOrder;
      // respaldo por createdAt desc para consistencia temporal
      sortOptions['createdAt'] = -1;
      sortOptions['_id'] = -1;
    }

    return this.logModel
      .find(mongoQuery)
      .sort(sortOptions)
      .limit(queryDto.limit || 50)
      .skip(queryDto.skip || 0) // ✅ USAR skip en lugar de offset
      .lean()
      .exec();
  }

  /**
   * Genera resumen estadístico de los logs encontrados
   */
  private async generateSummary(mongoQuery: any): Promise<any> {
    try {
      const [levelCounts, uniqueUsers, dateRange] = await Promise.all([
        this.logModel.aggregate([
          { $match: mongoQuery },
          { $group: { _id: '$level', count: { $sum: 1 } } },
        ]),
        this.logModel.aggregate([
          { $match: mongoQuery },
          { $match: { userId: { $ne: null } } },
          { $group: { _id: '$userId' } },
          { $count: 'uniqueUsers' },
        ]),
        this.logModel.aggregate([
          { $match: mongoQuery },
          {
            $group: {
              _id: null,
              oldest: { $min: '$createdAt' },
              newest: { $max: '$createdAt' },
            },
          },
        ]),
      ]);

      const counts = {
        errorCount: 0,
        warnCount: 0,
        infoCount: 0,
        debugCount: 0,
      };

      levelCounts.forEach(({ _id, count }) => {
        switch (_id) {
          case LogLevel.ERROR:
            counts.errorCount = count;
            break;
          case LogLevel.WARN:
            counts.warnCount = count;
            break;
          case LogLevel.INFO:
            counts.infoCount = count;
            break;
          case LogLevel.DEBUG:
            counts.debugCount = count;
            break;
        }
      });

      return {
        ...counts,
        uniqueUsers: uniqueUsers[0]?.uniqueUsers || 0,
        dateRange: dateRange?.[0] ?? { oldest: null, newest: null },
      };

    } catch (error) {
      this.logger.error(`Error generando resumen: ${error.message}`, error.stack);
      return {
        errorCount: 0,
        warnCount: 0,
        infoCount: 0,
        debugCount: 0,
        uniqueUsers: 0,
        dateRange: { oldest: null, newest: null },
      };
    }
  }

  /**
   * Obtiene estadísticas de logs por periodo de tiempo
   */
  async getLogStatistics(days: number = 30): Promise<any> {
    this.logger.log(`Generando estadísticas de logs para ${days} días`);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            level: '$level',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          levels: {
            $push: {
              level: '$_id.level',
              count: '$count',
            },
          },
          totalLogs: { $sum: '$count' },
        },
      },
      {
        $sort: { _id: 1 as const },
      },
    ];

    try {
      // ✅ AGREGADO: Manejo robusto de conexión MongoDB
      const statistics = await this.logModel.aggregate(pipeline).exec();
      this.logger.log(`Estadísticas generadas para ${statistics.length} días`);
      return statistics;
    } catch (error) {
      this.logger.error(`Error generando estadísticas: ${error.message}`, error.stack);
      
      // ✅ AGREGADO: Manejo específico de errores de conexión
      if (error.message?.includes('ECONNRESET') || error.message?.includes('connection')) {
        this.logger.warn('Error de conexión detectado, reintentando consulta de estadísticas...');
        
        // Un reintento simple
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const statistics = await this.logModel.aggregate(pipeline).exec();
          this.logger.log(`Estadísticas generadas en reintento para ${statistics.length} días`);
          return statistics;
        } catch (retryError) {
          this.logger.error(`Error en reintento de estadísticas: ${retryError.message}`);
          throw new BadRequestException('Error de conexión al generar estadísticas');
        }
      }
      
      throw new BadRequestException('Error interno al generar estadísticas');
    }
  }


  /**
   * ✅ CORREGIDO: Obtiene eventos críticos recientes con filtro correcto
   */
  async getCriticalEvents(hours: number = 24): Promise<Log[]> {
    this.logger.log(`Obteniendo eventos críticos de las últimas ${hours} horas`);

    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    try {
      const criticalEvents = await this.logModel
        .find({
          createdAt: { $gte: startDate },
          // ✅ CORREGIDO: Solo logs de nivel ERROR
          level: LogLevel.ERROR, // ✅ FILTRO DIRECTO por nivel error
        })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec();

      this.logger.log(`Se encontraron ${criticalEvents.length} eventos críticos`);
      return criticalEvents;

    } catch (error) {
      this.logger.error(`Error obteniendo eventos críticos: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener eventos críticos');
    }
  }
}