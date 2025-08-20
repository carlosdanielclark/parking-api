import { IsOptional, IsEnum, IsDateString, IsString, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log } from '../../schemas/log.schema';
import { LoggingService } from '../../logging/logging.service';
import { LogLevel, LogAction } from '../../schemas/log.schema';

/**
 * DTO para consultas avanzadas de logs administrativos
 * Incluye filtros, paginación y opciones de búsqueda
 */
export class LogsQueryDto {
  /**
   * Filtrar por nivel de severidad del log
   * Valores: error, warn, info, debug
   */
  @IsOptional()
  @IsEnum(LogLevel, { message: 'El nivel debe ser: error, warn, info o debug' })
  level?: LogLevel;

  /**
   * Filtrar por tipo de acción registrada
   * Permite buscar eventos específicos como login, reservas, etc.
   */
  @IsOptional()
  @IsEnum(LogAction, { 
    message: 'La acción debe ser válida según LogAction enum' 
  })
  action?: LogAction;

  /**
   * Filtrar por ID de usuario específico
   * Para rastrear actividad de un usuario particular
   */
  @IsOptional()
  @IsString({ message: 'El ID de usuario debe ser una cadena válida' })
  userId?: string;

  /**
   * Filtrar por tipo de recurso afectado
   * Ejemplos: user, reserva, plaza, vehiculo
   */
  @IsOptional()
  @IsString({ message: 'El recurso debe ser una cadena válida' })
  resource?: string;

  /**
   * Filtrar por ID específico del recurso
   * Para rastrear cambios en entidades específicas
   */
  @IsOptional()
  @IsString({ message: 'El ID del recurso debe ser una cadena válida' })
  resourceId?: string;

  /**
   * Fecha de inicio para filtrar logs
   * Formato ISO 8601
   */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser válida en formato ISO' })
  startDate?: string;

  /**
   * Fecha de fin para filtrar logs
   * Debe ser posterior a startDate si se especifica
   */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser válida en formato ISO' })
  endDate?: string;

  /**
   * Número máximo de registros por página
   * Rango: 1-500, por defecto 50
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor a 0' })
  @Max(1000, { message: 'El límite no puede ser mayor a 1000' })
  limit?: number = 50;

  /**
   * Número de registros a saltar (para paginación)
   * Mínimo: 0, por defecto 0
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El offset debe ser un número entero' })
  @Min(0, { message: 'El offset debe ser mayor o igual a 0' })
  offset?: number = 0;

  /**
   * Búsqueda de texto libre en logs
   * Busca en mensajes, errores y metadatos
   */
  @IsOptional()
  @IsString({ message: 'El texto de búsqueda debe ser una cadena válida' })
  search?: string;

  /**
   * Orden de los resultados
   * Valores: asc, desc (por defecto desc)
   */
  @IsOptional()
  @IsEnum(['asc', 'desc'], { message: 'El orden debe ser asc o desc' })
  @Transform(({ value }) => value?.toLowerCase())
  sortOrder?: 'asc' | 'desc' = 'desc';

  /**
   * Filtro por dirección IP específica
   * Para análisis de seguridad y accesos
   */
  @IsOptional()
  @IsString({ message: 'La IP debe ser una cadena válida' })
  ip?: string;
}
