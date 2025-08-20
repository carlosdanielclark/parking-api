import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log } from '../../schemas/log.schema';
import { ExportLogsDto, ExportFormat } from '../dto/export-logs.dto';
import { Parser as Json2CsvParser } from 'json2csv';
import * as ExcelJS from 'exceljs';

/**
 * Interface para el resultado de exportación
 */
export interface ExportResult {
  data: Buffer | string;
  filename: string;
  mimeType: string;
}

/**
 * Servicio para exportación de logs en múltiples formatos
 * Implementa exportación a CSV, JSON y Excel con formateo optimizado
 */
@Injectable()
export class LogsExportService {
  private readonly logger = new Logger(LogsExportService.name);

  constructor(
    @InjectModel(Log.name) 
    private readonly logModel: Model<Log>,
  ) {}

  /**
   * Exporta logs según los parámetros especificados
   * 
   * @param exportDto Configuración de exportación
   * @returns Datos del archivo exportado
   * @throws BadRequestException si no hay datos o formato inválido
   */
  async exportLogs(exportDto: ExportLogsDto): Promise<ExportResult> {
    this.logger.log(`Iniciando exportación de logs en formato ${exportDto.format}`);

    try {
      // Construir query para exportación
      const query = this.buildExportQuery(exportDto);
      this.logger.debug(`Query de exportación: ${JSON.stringify(query)}`);
      
      // Obtener logs con límite máximo de seguridad
      const logs = await this.logModel
        .find(query)
        .sort({ createdAt: -1 })
        .limit(exportDto.maxRecords || 10000)
        .lean()
        .exec();

      if (logs.length === 0) {
        throw new BadRequestException('No se encontraron logs para exportar con los filtros especificados');
      }

      this.logger.log(`Exportando ${logs.length} logs`);

      // Formatear datos para exportación
      const formattedLogs = this.formatLogsForExport(logs);
      
      // Generar archivo según formato solicitado
      switch (exportDto.format) {
        case ExportFormat.CSV:
          return this.generateCSV(formattedLogs);
        case ExportFormat.JSON:
          return this.generateJSON(formattedLogs);
        case ExportFormat.EXCEL:
          return await this.generateExcel(formattedLogs);
        default:
          throw new BadRequestException('Formato de exportación no válido');
      }

    } catch (error) {
      this.logger.error(`Error en exportación: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error interno durante la exportación');
    }
  }

  /**
   * Construye la consulta MongoDB para exportación
   * 
   * @param exportDto Parámetros de exportación
   * @returns Objeto de consulta MongoDB
   */
  private buildExportQuery(exportDto: ExportLogsDto): any {
    const query: any = {};

    if (exportDto.level) {
      query.level = exportDto.level;
    }
    
    if (exportDto.action) {
      query.action = exportDto.action;
    }
    
    if (exportDto.startDate || exportDto.endDate) {
      query.createdAt = {};
      if (exportDto.startDate) {
        query.createdAt.$gte = new Date(exportDto.startDate);
      }
      if (exportDto.endDate) {
        query.createdAt.$lte = new Date(exportDto.endDate);
      }
    }

    return query;
  }

  /**
   * Formatea los logs para exportación con campos estandardizados
   * 
   * @param logs Array de logs de MongoDB
   * @returns Array de objetos formateados para exportación
   */
  private formatLogsForExport(logs: any[]): any[] {
    return logs.map(log => ({
      id: log._id.toString(),
      timestamp: log.createdAt.toISOString(),
      level: log.level,
      action: log.action,
      message: log.message || 'N/A',
      userId: log.userId || 'N/A',
      resource: log.resource || 'N/A',
      resourceId: log.resourceId || 'N/A',
      ip: log.context?.ip || 'N/A',
      userAgent: log.context?.userAgent || 'N/A',
      method: log.context?.method || 'N/A',
      url: log.context?.url || 'N/A',
      statusCode: log.context?.statusCode || 'N/A',
      responseTime: log.context?.responseTime || 'N/A',
      errorMessage: log.details?.error || 'N/A',
      errorStack: log.details?.stackTrace || 'N/A',
      metadata: log.details?.metadata ? JSON.stringify(log.details.metadata) : 'N/A',
    }));
  }

  /**
   * Genera archivo CSV
   * 
   * @param data Datos formateados para exportación
   * @returns Resultado de exportación CSV
   */
  private generateCSV(data: any[]): ExportResult {
    this.logger.debug('Generando archivo CSV');

    const fields = [
      'id', 'timestamp', 'level', 'action', 'message', 'userId', 'resource', 
      'resourceId', 'ip', 'userAgent', 'method', 'url', 'statusCode', 
      'responseTime', 'errorMessage', 'errorStack', 'metadata'
    ];

    try {
      const parser = new Json2CsvParser({ fields });
      const csv = parser.parse(data);
      
      const timestamp = new Date().toISOString().split('T')[0];
      
      return {
        data: csv,
        filename: `parking-logs-${timestamp}.csv`,
        mimeType: 'text/csv',
      };

    } catch (error) {
      this.logger.error(`Error generando CSV: ${error.message}`, error.stack);
      throw new BadRequestException('Error al generar archivo CSV');
    }
  }

  /**
   * Genera archivo JSON
   * 
   * @param data Datos formateados para exportación
   * @returns Resultado de exportación JSON
   */
  private generateJSON(data: any[]): ExportResult {
    this.logger.debug('Generando archivo JSON');

    const timestamp = new Date().toISOString().split('T')[0];
    
    const jsonData = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalRecords: data.length,
        generatedBy: 'Parking API Admin Panel',
        version: '1.0',
      },
      logs: data,
    };

    return {
      data: JSON.stringify(jsonData, null, 2),
      filename: `parking-logs-${timestamp}.json`,
      mimeType: 'application/json',
    };
  }

  /**
   * Genera archivo Excel con formato profesional
   * 
   * @param data Datos formateados para exportación
   * @returns Resultado de exportación Excel
   */
  private async generateExcel(data: any[]): Promise<ExportResult> {
    this.logger.debug('Generando archivo Excel');

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Logs de Parking');

      // Metadatos del workbook
      workbook.creator = 'Parking API Admin Panel';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Configurar columnas con ancho optimizado
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 25 },
        { header: 'Fecha/Hora', key: 'timestamp', width: 20 },
        { header: 'Nivel', key: 'level', width: 10 },
        { header: 'Acción', key: 'action', width: 20 },
        { header: 'Mensaje', key: 'message', width: 40 },
        { header: 'Usuario ID', key: 'userId', width: 25 },
        { header: 'Recurso', key: 'resource', width: 15 },
        { header: 'Recurso ID', key: 'resourceId', width: 25 },
        { header: 'IP', key: 'ip', width: 15 },
        { header: 'User Agent', key: 'userAgent', width: 30 },
        { header: 'Método HTTP', key: 'method', width: 10 },
        { header: 'URL', key: 'url', width: 40 },
        { header: 'Código Estado', key: 'statusCode', width: 15 },
        { header: 'Tiempo Respuesta', key: 'responseTime', width: 15 },
        { header: 'Error', key: 'errorMessage', width: 40 },
        { header: 'Stack Trace', key: 'errorStack', width: 50 },
        { header: 'Metadatos', key: 'metadata', width: 30 },
      ];

      // Agregar datos
      worksheet.addRows(data);

      // Estilo para encabezados
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Formato condicional para niveles de log
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Saltar encabezados
          const levelCell = row.getCell('level');
          const level = levelCell.value as string;
          
          switch (level?.toLowerCase()) {
            case 'error':
              levelCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFF6B6B' }
              };
              break;
            case 'warn':
              levelCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFD93D' }
              };
              break;
            case 'info':
              levelCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF6BCF7F' }
              };
              break;
          }
        }
      });

      // Congelar primera fila
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Convertir a buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      const timestamp = new Date().toISOString().split('T')[0];
      
      return {
        data: buffer as unknown as Buffer<ArrayBufferLike>,
        filename: `parking-logs-${timestamp}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };


    } catch (error) {
      this.logger.error(`Error generando Excel: ${error.message}`, error.stack);
      throw new BadRequestException('Error al generar archivo Excel');
    }
  }
}
