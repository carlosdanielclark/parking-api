import { IsEnum, IsOptional, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { LogLevel, LogAction } from '../../schemas/log.schema';

/**
 * Formatos de exportación disponibles
 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  EXCEL = 'excel',
}

/**
 * DTO para configurar la exportación de logs
 * Incluye filtros básicos y opciones de formato
 */
export class ExportLogsDto {
  /**
   * Filtro por nivel de log para exportación
   */
  @IsOptional()
  @IsEnum(LogLevel, { message: 'El nivel debe ser: error, warn, info o debug' })
  level?: LogLevel;

  /**
   * Filtro por acción para exportación
   */
  @IsOptional()
  @IsEnum(LogAction, { message: 'La acción debe ser válida' })
  action?: LogAction;

  /**
   * Fecha de inicio para exportación
   */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser válida en formato ISO' })
  startDate?: string;

  /**
   * Fecha de fin para exportación
   */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser válida en formato ISO' })
  endDate?: string;

  /**
   * Formato de exportación requerido
   */
  @IsEnum(ExportFormat, { message: 'El formato debe ser: csv, json o excel' })
  format: ExportFormat;

  /**
   * Número máximo de registros a exportar
   * Límite de seguridad para evitar exportaciones masivas
   */
  @IsOptional()
  @IsInt({ message: 'El máximo de registros debe ser un número entero' })
  @Min(1, { message: 'Debe exportar al menos 1 registro' })
  @Max(50000, { message: 'No se pueden exportar más de 50,000 registros por seguridad' })
  @Type(() => Number)
  maxRecords?: number = 10000;
}