import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminLogsController } from './controllers/admin-logs.controller';
import { LogsQueryService } from './services/logs-query.service';
import { LogsExportService } from './services/logs-export.service';
import { LoggingService } from '../logging/logging.service';
import { LogAction, LogLevel } from '../schemas/log.schema';
import { Log } from '../schemas/log.schema'; // Importa tu modelo Log para instanciar objetos reales

/**
 * Suite de pruebas para los endpoints administrativos de logs
 * Verifica funcionalidad de consulta, exportación y auditoría
 */
describe('AdminLogsController', () => {
  let controller: AdminLogsController;
  let logsQueryService: LogsQueryService;
  let logsExportService: LogsExportService;
  let loggingService: LoggingService;

  const mockUser = {
    userId: 'admin-123',
    email: 'admin@parking.com',
    role: 'admin',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminLogsController],
      providers: [
        {
          provide: LogsQueryService,
          useValue: {
            queryLogs: jest.fn(),
            getLogStatistics: jest.fn(),
            getCriticalEvents: jest.fn(),
          },
        },
        {
          provide: LogsExportService,
          useValue: {
            exportLogs: jest.fn(),
          },
        },
        {
          provide: LoggingService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminLogsController>(AdminLogsController);
    logsQueryService = module.get<LogsQueryService>(LogsQueryService);
    logsExportService = module.get<LogsExportService>(LogsExportService);
    loggingService = module.get<LoggingService>(LoggingService);
  });

  describe('getLogs', () => {
    it('should return paginated logs for admin user', async () => {
      const mockQuery = {
        limit: 50,
        offset: 0,
        level: LogLevel.INFO,
      };

      const mockResponse = {
        logs: [
          new Log({
            _id: '507f1f77bcf86cd799439011',
            level: LogLevel.INFO,
            action: 'LOGIN',
            message: 'Usuario autenticado',
            createdAt: new Date(),
          }),
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        filters: mockQuery,
        summary: {
          errorCount: 0,
          warnCount: 0,
          infoCount: 1,
          debugCount: 0,
          uniqueUsers: 1,
          dateRange: {
            oldest: new Date(),
            newest: new Date(),
          },
        },
      };

      jest.spyOn(logsQueryService, 'queryLogs').mockResolvedValue(mockResponse);

      const result = await controller.getLogs(mockQuery, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.logs);
      expect(result.pagination).toEqual(mockResponse.pagination);
      expect(result.summary).toEqual(mockResponse.summary);
      expect(logsQueryService.queryLogs).toHaveBeenCalledWith(mockQuery, mockUser.userId);
    });

    it('should handle and log errors appropriately', async () => {
      const mockQuery = { limit: 50, offset: 0 };
      const error = new BadRequestException('Database connection failed');

      jest.spyOn(logsQueryService, 'queryLogs').mockRejectedValue(error);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      await expect(controller.getLogs(mockQuery, mockUser)).rejects.toThrow(error);

      expect(loggingService.log).toHaveBeenCalledWith(
        LogLevel.ERROR,
        LogAction.SYSTEM_ERROR,
        expect.stringContaining('Error en consulta administrativa de logs'),
        mockUser.userId,
        'admin_logs',
        null,
        expect.objectContaining({ error: error.message }),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should validate query parameters correctly', async () => {
      const invalidQuery = {
        limit: 1000, // Excede el máximo permitido
        offset: -1,  // Valor inválido
      };

      const mockResponse = {
        logs: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 50,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
        filters: invalidQuery,
        summary: {
          errorCount: 0,
          warnCount: 0,
          infoCount: 0,
          debugCount: 0,
          uniqueUsers: 0,
          dateRange: { oldest: null, newest: null },
        },
      };

      jest.spyOn(logsQueryService, 'queryLogs').mockResolvedValue(mockResponse);

      const result = await controller.getLogs(invalidQuery, mockUser);

      expect(result.success).toBe(true);
      expect(logsQueryService.queryLogs).toHaveBeenCalledWith(invalidQuery, mockUser.userId);
    });
  });

  describe('getLogStatistics', () => {
    it('should return log statistics for valid period', async () => {
      const days = 30;
      const mockStatistics = [
        {
          _id: '2024-01-01',
          levels: [
            { level: 'info', count: 100 },
            { level: 'error', count: 5 },
          ],
          totalLogs: 105,
        },
      ];

      jest.spyOn(logsQueryService, 'getLogStatistics').mockResolvedValue(mockStatistics);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      const result = await controller.getLogStatistics(days, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStatistics);
      expect(result.metadata.period).toBe('30 días');
      expect(logsQueryService.getLogStatistics).toHaveBeenCalledWith(days);
      expect(loggingService.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        LogAction.ACCESS_LOGS,
        expect.stringContaining('estadísticas'),
        mockUser.userId,
        'log_statistics',
        null,
        expect.objectContaining({ days_requested: days }),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should reject invalid day ranges', async () => {
      const invalidDays = 500;

      await expect(controller.getLogStatistics(invalidDays, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCriticalEvents', () => {
    it('should return critical events for valid period', async () => {
      const hours = 24;
      const mockCriticalEvents = [
        new Log({
          _id: '507f1f77bcf86cd799439012',
          level: LogLevel.ERROR,
          action: LogAction.SYSTEM_ERROR,
          message: 'Database connection failed',
          createdAt: new Date(),
        }),
      ];

      jest.spyOn(logsQueryService, 'getCriticalEvents').mockResolvedValue(mockCriticalEvents);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      const result = await controller.getCriticalEvents(hours, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCriticalEvents);
      expect(result.metadata.count).toBe(1);
      expect(result.metadata.alertLevel).toBe('LOW');
      expect(logsQueryService.getCriticalEvents).toHaveBeenCalledWith(hours);
    });

    it('should calculate correct alert levels', async () => {
      const hours = 24;

      const manyCriticalEvents = Array(60).fill(
        new Log({
          _id: '507f1f77bcf86cd799439012',
          level: LogLevel.ERROR,
          action: LogAction.SYSTEM_ERROR,
          message: 'Error',
          createdAt: new Date(),
        }),
      );

      jest.spyOn(logsQueryService, 'getCriticalEvents').mockResolvedValue(manyCriticalEvents);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      const result = await controller.getCriticalEvents(hours, mockUser);

      expect(result.metadata.alertLevel).toBe('HIGH');
    });
  });

  describe('exportLogs', () => {
    it('should export logs in CSV format', async () => {
      const mockExportDto = {
        format: 'csv' as any,
        maxRecords: 1000,
        level: LogLevel.ERROR,
      };

      const mockExportResult = {
        data: 'id,timestamp,level,message\n1,2024-01-01T00:00:00.000Z,error,Test error',
        filename: 'parking-logs-2024-01-01.csv',
        mimeType: 'text/csv',
      };

      const mockResponse = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      jest.spyOn(logsExportService, 'exportLogs').mockResolvedValue(mockExportResult);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      await controller.exportLogs(mockExportDto, mockResponse as any, mockUser);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="parking-logs-2024-01-01.csv"',
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockExportResult.data);
      expect(logsExportService.exportLogs).toHaveBeenCalledWith(mockExportDto);
      expect(loggingService.log).toHaveBeenCalledTimes(2); // Intento + éxito
    });

    it('should handle export errors gracefully', async () => {
      const mockExportDto = { format: 'csv' as any };
      const mockResponse = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      };

      const error = new Error('Export failed');
      jest.spyOn(logsExportService, 'exportLogs').mockRejectedValue(error);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      await controller.exportLogs(mockExportDto, mockResponse as any, mockUser);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Error al exportar logs',
          error: error.message,
        }),
      );
    });

    it('should reject export without format', async () => {
      const mockExportDto = {} as any; // Sin formato
      const mockResponse = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportLogs(mockExportDto, mockResponse as any, mockUser);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Error al exportar logs',
        }),
      );
    });
  });

  describe('getLogsHealth', () => {
    it('should return system health information', async () => {
      const mockRecentLogs = {
        logs: [{ createdAt: new Date() }],
        pagination: {
          total: 10,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        filters: {},
        summary: {
          errorCount: 0,
          warnCount: 0,
          infoCount: 10,
          debugCount: 0,
          uniqueUsers: 1,
          dateRange: { oldest: new Date(), newest: new Date() },
        },
      };

      const mockCriticalEvents: Log[] = [];

      jest.spyOn(logsQueryService, 'queryLogs').mockResolvedValue(mockRecentLogs as any);
      jest.spyOn(logsQueryService, 'getCriticalEvents').mockResolvedValue(mockCriticalEvents);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      const result = await controller.getLogsHealth(mockUser);

      expect(result.success).toBe(true);
      expect(result.data.systemHealth.status).toBe('healthy');
      expect(result.data.systemHealth.logsInLastHour).toBe(10);
      expect(result.data.systemHealth.criticalEventsInLastHour).toBe(0);
      expect(result.data.systemHealth.recommendations).toContain('✅ Sistema funcionando correctamente');
    });

    it('should detect critical system status', async () => {
      const mockRecentLogs = {
        logs: [{
            _id: '507f1f77bcf86cd799439011',
            level: LogLevel.INFO,
            action: 'LOGIN',
            message: 'Mensaje de log',
            createdAt: new Date(),
          } as any,
        ],
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
        filters: {},
        summary: {
          errorCount: 0,
          warnCount: 0,
          infoCount: 0,
          debugCount: 0,
          uniqueUsers: 0,
          dateRange: { oldest: null, newest: null },
        },
      };

      const manyCriticalEvents = Array(60).fill(
        new Log({
          _id: '507f1f77bcf86cd799439012',
          level: LogLevel.ERROR,
          action: LogAction.SYSTEM_ERROR,
          message: 'Error',
          createdAt: new Date(),
        }),
      );

      jest.spyOn(logsQueryService, 'queryLogs').mockResolvedValue(mockRecentLogs);
      jest.spyOn(logsQueryService, 'getCriticalEvents').mockResolvedValue(manyCriticalEvents);
      jest.spyOn(loggingService, 'log').mockResolvedValue(undefined);

      const result = await controller.getLogsHealth(mockUser);

      expect(result.data.systemHealth.status).toBe('critical');
      expect(result.data.systemHealth.recommendations).toContain('⚠️ Sistema en estado crítico - Revisar eventos inmediatamente');
    });
  });
});
