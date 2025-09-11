import { IsOptional, IsEnum, IsDateString, IsString, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { LogLevel, LogAction, LogActionFilter } from '../../schemas/log.schema';

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
  @IsEnum([...Object.values(LogAction), 'reserva_actions'] as const, { 
    message: 'La acción debe ser válida según LogAction enum o "reserva_actions"' 
  })
  action?: LogActionFilter; 

  /**
   * Filtrar por ID de usuario específico
   */
  @IsOptional()
  @IsString({ message: 'El ID de usuario debe ser una cadena válida' })
  userId?: string;

  /**
   * Filtrar por tipo de recurso afectado
   */
  @IsOptional()
  @IsString({ message: 'El recurso debe ser una cadena válida' })
  resource?: string;

  /**
   * Filtrar por ID específico del recurso
   */
  @IsOptional()
  @IsString({ message: 'El ID del recurso debe ser una cadena válida' })
  resourceId?: string;

  /**
   * Fecha de inicio en formato ISO
   */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser válida en formato ISO' })
  startDate?: string;

  /**
   * Fecha de fin en formato ISO
   */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser válida en formato ISO' })
  endDate?: string;

  /**
   * Página para paginación (opcional)
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor a 0' })
  page?: number = 1;

  /**
   * Número de registros por página (opcional)
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor a 0' })
  @Max(1000, { message: 'El límite no puede ser mayor a 1000' })
  limit?: number = 50;

  /**
   * ✅ NUEVO: Skip directo para paginación interna
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El skip debe ser un número entero' })
  @Min(0, { message: 'El skip debe ser mayor o igual a 0' })
  skip?: number;

  /**
   * Búsqueda libre
   */
  @IsOptional()
  @IsString({ message: 'El texto de búsqueda debe ser una cadena válida' })
  search?: string;

  /**
   * Orden asc/desc
   */
  @IsOptional()
  @IsEnum(['asc', 'desc'], { message: 'El orden debe ser asc o desc' })
  @Transform(({ value }) => value?.toLowerCase())
  sortOrder?: 'asc' | 'desc' = 'desc';

  /**
   * Filtro por IP
   */
  @IsOptional()
  @IsString({ message: 'La IP debe ser una cadena válida' })
  ip?: string;

  /**
   * Campo de ordenación
   */
  @IsOptional()
  @IsString({ message: 'El campo de ordenación debe ser una cadena válida' })
  sortBy?: string = 'createdAt';
}