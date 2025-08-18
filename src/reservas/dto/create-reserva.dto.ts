// src/reservas/dto/create-reserva.dto.ts


import { IsUUID, IsInt, IsDateString, IsOptional } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO para la creación de reservas de parking
 * Caso de uso principal: Cliente desea reservar una plaza
 * Incluye validaciones temporales y de integridad referencial
 */
export class CreateReservaDto {
  /**
   * ID del usuario que realiza la reserva
   * Debe ser un UUID válido de un usuario existente
   * El sistema validará que el usuario autenticado coincida (excepto admin)
   */
  @IsUUID(4, { message: 'El ID del usuario debe ser un UUID válido' })
  usuario_id: string;

  /**
   * ID de la plaza a reservar
   * Debe ser un número entero de una plaza existente y disponible
   * El sistema verificará disponibilidad y estado LIBRE
   */
  @IsInt({ message: 'El ID de la plaza debe ser un número entero' })
  @Type(() => Number)
  plaza_id: number;

  /**
   * ID del vehículo para el cual se hace la reserva
   * Debe ser un UUID válido de un vehículo del usuario
   * El sistema validará que el vehículo pertenezca al usuario
   */
  @IsUUID(4, { message: 'El ID del vehículo debe ser un UUID válido' })
  vehiculo_id: string;

  /**
   * Fecha y hora de inicio de la reserva
   * Debe ser una fecha futura válida en formato ISO
   * No puede ser en el pasado para evitar reservas inválidas
   */
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha válida en formato ISO' })
  fecha_inicio: string;

  /**
   * Fecha y hora de finalización de la reserva
   * Debe ser una fecha futura válida en formato ISO
   * Debe ser posterior a la fecha de inicio
   */
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha válida en formato ISO' })
  fecha_fin: string;
}
