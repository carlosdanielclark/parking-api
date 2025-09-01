// src/reservas/dto/create-reserva.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min, IsDate } from 'class-validator';

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
  @ApiProperty({ description: 'UUID del usuario que reserva' })
  @IsUUID('4', { message: 'usuario_id inválido (UUID v4)' })
  usuario_id: string;

  /**
   * ID de la plaza a reservar
   * Debe ser un número entero de una plaza existente y disponible
   * El sistema verificará disponibilidad y estado LIBRE
   */
  @ApiProperty({ description: 'ID de la plaza (entero TypeORM)' })
  @IsInt({ message: 'plaza_id debe ser entero' })
  @Min(1, { message: 'plaza_id debe ser > 0' })
  plaza_id: number;

  /**
   * ID del vehículo para el cual se hace la reserva
   * Debe ser un UUID válido de un vehículo del usuario
   * El sistema validará que el vehículo pertenezca al usuario
   */
  @ApiProperty({ description: 'UUID del vehículo' })
  @IsUUID('4', { message: 'vehiculo_id inválido (UUID v4)' })
  vehiculo_id: string;

  /**
   * Fecha y hora de inicio de la reserva
   * Debe ser una fecha futura válida en formato ISO
   * No puede ser en el pasado para evitar reservas inválidas
   */
  @ApiProperty({ description: 'Fecha/hora de inicio (ISO 8601)' })
  @Type(() => Date)
  @IsDate()
  fecha_inicio: Date;

  /**
   * Fecha y hora de finalización de la reserva
   * Debe ser una fecha futura válida en formato ISO
   * Debe ser posterior a la fecha de inicio
   */
  @ApiProperty({ description: 'Fecha/hora de fin (ISO 8601)' })
  @Type(() => Date)
  @IsDate()
  fecha_fin: Date;
}
