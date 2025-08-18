// src/vehiculos/dto/create-vehiculo.dto.ts

import { IsString, IsUUID, MinLength, IsOptional } from 'class-validator';

/**
 * DTO para la creación de nuevos vehículos
 * Utilizado por clientes para registrar sus vehículos
 * Incluye validaciones para garantizar datos correctos
 */
export class CreateVehiculoDto {
  /**
   * Placa o matrícula del vehículo
   * Debe ser única en el sistema para evitar conflictos
   * Campo requerido para identificación legal del vehículo
   */
  @IsString({ message: 'La placa debe ser una cadena de texto válida' })
  @MinLength(6, { message: 'La placa debe tener al menos 6 caracteres' })
  placa: string;

  /**
   * Marca del vehículo (opcional)
   * Información descriptiva para facilitar la identificación
   * Ejemplos: Toyota, Ford, BMW, Chevrolet
   */
  @IsOptional()
  @IsString({ message: 'La marca debe ser una cadena de texto válida' })
  marca?: string;

  /**
   * Modelo específico del vehículo (opcional)
   * Complementa la información de marca para mejor identificación
   * Ejemplos: Corolla, Focus, Serie 3, Aveo
   */
  @IsOptional()
  @IsString({ message: 'El modelo debe ser una cadena de texto válida' })
  modelo?: string;

  /**
   * Color del vehículo (opcional)
   * Ayuda en la identificación visual del vehículo en el parking
   * Ejemplos: Blanco, Negro, Rojo, Azul
   */
  @IsOptional()
  @IsString({ message: 'El color debe ser una cadena de texto válida' })
  color?: string;

  /**
   * ID del usuario propietario del vehículo
   * Campo requerido para establecer la relación de propiedad
   * Debe ser un UUID válido de un usuario existente
   */
  @IsUUID(4, { message: 'El ID del usuario debe ser un UUID válido' })
  usuario_id: string;
}
