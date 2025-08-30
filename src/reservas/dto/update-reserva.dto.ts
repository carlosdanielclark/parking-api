// src/reservas/dto/update-reserva.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { EstadoReservaDTO  } from '../../entities/reserva.entity';

/**
 * DTO para la actualización de reservas existentes
 * Permite modificación limitada de reservas activas
 * Solo fechas y estado pueden ser modificados por seguridad
 */
export class UpdateReservaDto {
  /**
   * Nueva fecha de inicio de la reserva (opcional)
   * Solo puede modificarse si la reserva está activa
   * Debe seguir siendo futura y anterior a fecha_fin
   */
  @ApiPropertyOptional({ description: 'Nueva fecha/hora de inicio' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'fecha_inicio debe ser Date válida' })
  fecha_inicio?: Date;


  /**
   * Nueva fecha de finalización de la reserva (opcional)
   * Debe ser posterior a la fecha de inicio actualizada
   * Útil para extender o acortar el tiempo de reserva
   */
  @ApiPropertyOptional({ description: 'Nueva fecha/hora de fin' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'fecha_fin debe ser Date válida' })
  fecha_fin?: Date;
  /**
   * Nuevo estado de la reserva (opcional)
   * Solo administradores pueden cambiar estados
   * ACTIVA, FINALIZADA, CANCELADA
   */
  @IsOptional()
  @IsEnum(EstadoReservaDTO, { 
    message: 'El estado debe ser: activa, finalizada o cancelada' 
  })
  estado?: EstadoReservaDTO;
}