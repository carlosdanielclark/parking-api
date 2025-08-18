// src/reservas/dto/update-reserva.dto.ts

import { IsDateString, IsOptional, IsEnum } from 'class-validator';
import { EstadoReserva } from '../../entities/reserva.entity';

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
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha válida en formato ISO' })
  fecha_inicio?: string;

  /**
   * Nueva fecha de finalización de la reserva (opcional)
   * Debe ser posterior a la fecha de inicio actualizada
   * Útil para extender o acortar el tiempo de reserva
   */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha válida en formato ISO' })
  fecha_fin?: string;

  /**
   * Nuevo estado de la reserva (opcional)
   * Solo administradores pueden cambiar estados
   * ACTIVA, FINALIZADA, CANCELADA
   */
  @IsOptional()
  @IsEnum(EstadoReserva, { 
    message: 'El estado debe ser: activa, finalizada o cancelada' 
  })
  estado?: EstadoReserva;
}