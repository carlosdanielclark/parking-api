// src/vehiculos/dto/create-vehiculo.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength, MaxLength, IsOptional } from 'class-validator';

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
  @ApiProperty({ example: 'ABC1234' })
  @IsString({ message: 'placa debe ser texto' })
  @MinLength(6, { message: 'placa debe tener al menos 6 caracteres' })
  @MaxLength(12, { message: 'placa máx 12 caracteres' })
  placa!: string;
  /**
   * Marca del vehículo (opcional)
   * Información descriptiva para facilitar la identificación
   * Ejemplos: Toyota, Ford, BMW, Chevrolet
   */
  @ApiProperty({ example: 'Toyota', required: false })
  @IsOptional()
  @IsString({ message: 'marca debe ser texto' })
  @MaxLength(40)
  marca?: string;
  /**
   * Modelo específico del vehículo (opcional)
   * Complementa la información de marca para mejor identificación
   * Ejemplos: Corolla, Focus, Serie 3, Aveo
   */
  @ApiProperty({ example: 'Corolla', required: false })
  @IsOptional()
  @IsString({ message: 'modelo debe ser texto' })
  @MaxLength(40)
  modelo?: string;
  /**
   * Color del vehículo (opcional)
   * Ayuda en la identificación visual del vehículo en el parking
   * Ejemplos: Blanco, Negro, Rojo, Azul
   */
  @ApiProperty({ example: 'Blanco', required: false })
  @IsOptional()
  @IsString({ message: 'color debe ser texto' })
  @MaxLength(30)
  color?: string;
  /**
   * ID del usuario propietario del vehículo
   * Campo requerido para establecer la relación de propiedad
   * Debe ser un UUID válido de un usuario existente
   */
  @ApiProperty({ description: 'Propietario del vehículo (UUID de User)' })
  @IsUUID('4', { message: 'usuario_id no es un UUID v4 válido' })
  usuario_id!: string;
}
