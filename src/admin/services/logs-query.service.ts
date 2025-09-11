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
   * Ejecuta consulta de logs con filtros avanzados y paginación
   * Registra el acceso para auditoría
   * 
   * @param queryDto Parámetros de consulta y filtros
   * @param adminUserId ID del administrador que realiza la consulta
   * @returns Logs paginados con metadatos y resumen
   */
  async queryLogs(queryDto: LogsQueryDto, adminUserId: string): Promise<LogsResponse> {
    this.logger.log(`Administrador ${adminUserId} consultando logs con filtros: ${JSON.stringify(queryDto)}`);

    try {
      // Registrar acceso a logs para auditoría
      await this.loggingService.log(
        LogLevel.INFO,
        LogAction.ACCESS_LOGS,
        `Administrador consultó logs del sistema`,
        adminUserId,
        'logs',
        undefined,
        { queryFilters: queryDto, timestamp: new Date() },
        { method: 'GET', resource_type: 'admin_logs_query', admin_operation: true }
      );

      // Construir consulta MongoDB desde DTO
      const mongoQuery = this.buildMongoQuery(queryDto);
      this.logger.debug(`Query MongoDB construida: ${JSON.stringify(mongoQuery)}`);

      // Ejecutar consultas simultáneas para optimizar rendimiento
      const [logs, total, summary] = await Promise.all([
        this.executeLogsQuery(mongoQuery, queryDto),
        this.logModel.countDocuments(mongoQuery),
        this.generateSummary(mongoQuery),
      ]);

      // Calcular metadatos de paginación
      const page = Math.floor((queryDto.offset || 0) / (queryDto.limit || 50)) + 1;
      const totalPages = Math.ceil(total / (queryDto.limit || 50));

      const response: LogsResponse = {
        logs,
        pagination: {
          total,
          page,
          limit: queryDto.limit || 50,
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
   * Construye la consulta MongoDB a partir de los filtros del DTO
   * 
   * @param queryDto Parámetros de filtrado
   * @returns Objeto de consulta MongoDB
   */
  private buildMongoQuery(queryDto: LogsQueryDto): any {
    const query: any = {};

    // Filtros directos por campos
    if (queryDto.level) query.level = queryDto.level;
    if (queryDto.action) query.action = queryDto.action;
    if (queryDto.userId) query.userId = queryDto.userId;
    if (queryDto.resource) query.resource = queryDto.resource;
    if (queryDto.resourceId) query.resourceId = queryDto.resourceId;
    if (queryDto.ip) query['context.ip'] = queryDto.ip;

    // Filtro de rango de fechas
    if (queryDto.startDate || queryDto.endDate) {
      query.createdAt = {};
      if (queryDto.startDate) {
        query.createdAt.$gte = new Date(queryDto.startDate);
      }
      if (queryDto.endDate) {
        query.createdAt.$lte = new Date(queryDto.endDate);
      }
    }

    // Búsqueda de texto libre con operador OR
    if (queryDto.search) {
      query.$or = [
        { message: { $regex: queryDto.search, $options: 'i' } },
        { 'details.error': { $regex: queryDto.search, $options: 'i' } },
        { 'details.reason': { $regex: queryDto.search, $options: 'i' } },
        { 'context.userAgent': { $regex: queryDto.search, $options: 'i' } },
        { userId: { $regex: queryDto.search, $options: 'i' } },
        { resourceId: { $regex: queryDto.search, $options: 'i' } },
      ];
    }

    return query;
  }

  /**
   * Ejecuta la consulta de logs con ordenamiento y paginación
   * 
   * @param mongoQuery Consulta MongoDB construida
   * @param queryDto Parámetros de consulta original
   * @returns Array de logs encontrados
   */
  private async executeLogsQuery(mongoQuery: any, queryDto: LogsQueryDto): Promise<Log[]> {
    const sortOrder = queryDto.sortOrder === 'asc' ? 1 : -1;
    
    return this.logModel
      .find(mongoQuery)
      .sort({ createdAt: sortOrder })
      .limit(queryDto.limit || 50)
      .skip(queryDto.offset || 0)
      .lean()
      .exec();
  }

  /**
   * Genera resumen estadístico de los logs encontrados
   * 
   * @param mongoQuery Consulta MongoDB para el resumen
   * @returns Objeto con estadísticas agregadas
   */
  private async generateSummary(mongoQuery: any): Promise<any> {
    try {
      const [levelCounts, uniqueUsers, dateRange] = await Promise.all([
        // Conteo por nivel de severidad
        this.logModel.aggregate([
          { $match: mongoQuery },
          { $group: { _id: '$level', count: { $sum: 1 } } },
        ]),
        
        // Conteo de usuarios únicos
        this.logModel.aggregate([
          { $match: mongoQuery },
          { $match: { userId: { $ne: null } } },
          { $group: { _id: '$userId' } },
          { $count: 'uniqueUsers' },
        ]),
        
        // Rango de fechas
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

      // Inicializar contadores por nivel
      const counts = {
        errorCount: 0,
        warnCount: 0,
        infoCount: 0,
        debugCount: 0,
      };

      // Procesar conteos por nivel
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
        dateRange: dateRange || { oldest: null, newest: null },
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
   * Útil para gráficos y dashboards
   * 
   * @param days Número de días hacia atrás para analizar
   * @returns Estadísticas agrupadas por fecha y nivel
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
        $sort: { _id: 1 as const},
      },
    ];

    try {
      const statistics = await this.logModel.aggregate(pipeline);
      this.logger.log(`Estadísticas generadas para ${statistics.length} días`);
      return statistics;
    } catch (error) {
      this.logger.error(`Error generando estadísticas: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al generar estadísticas');
    }
  }

  /**
   * Obtiene eventos críticos recientes
   * Para alertas y monitoreo de seguridad
   * 
   * @param hours Número de horas hacia atrás para buscar
   * @returns Lista de eventos críticos
   */
  async getCriticalEvents(hours: number = 24): Promise<Log[]> {
    this.logger.log(`Obteniendo eventos críticos de las últimas ${hours} horas`);

    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    try {
      const criticalEvents = await this.logModel
        .find({
          createdAt: { $gte: startDate },
          $or: [
            { level: LogLevel.ERROR },
            { 'context.critical_operation': true },
            { action: LogAction.ROLE_CHANGE },
            { action: LogAction.DELETE_USER },
          ],
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
