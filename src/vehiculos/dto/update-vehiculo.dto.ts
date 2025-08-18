// src/vehiculos/dto/update-vehiculo.dto.ts

import { IsString, MinLength, IsOptional } from 'class-validator';

/**
 * DTO para la actualización de vehículos existentes
 * Permite actualización parcial de datos del vehículo
 * No permite cambiar el propietario (usuario_id) por seguridad
 */
export class UpdateVehiculoDto {
  /**
   * Nueva placa del vehículo (opcional)
   * Si se cambia, debe mantener unicidad en el sistema
   * Útil para casos de cambio de matrícula
   */
  @IsOptional()
  @IsString({ message: 'La placa debe ser una cadena de texto válida' })
  @MinLength(6, { message: 'La placa debe tener al menos 6 caracteres' })
  placa?: string;

  /**
   * Nueva marca del vehículo (opcional)
   * Permite corregir información incorrecta
   */
  @IsOptional()
  @IsString({ message: 'La marca debe ser una cadena de texto válida' })
  marca?: string;

  /**
   * Nuevo modelo del vehículo (opcional)
   * Permite corregir información incorrecta
   */
  @IsOptional()
  @IsString({ message: 'El modelo debe ser una cadena de texto válida' })
  modelo?: string;

  /**
   * Nuevo color del vehículo (opcional)
   * Útil cuando el vehículo cambia de color por pintura
   */
  @IsOptional()
  @IsString({ message: 'El color debe ser una cadena de texto válida' })
  color?: string;
}
