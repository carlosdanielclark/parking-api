// src/plazas/dto/update-plaza.dto.ts

import { IsString, IsEnum, IsOptional } from 'class-validator';
import { EstadoPlaza, TipoPlaza } from '../../entities/plaza.entity';

/**
 * DTO para la actualización de plazas existentes
 * Permite actualización parcial, todos los campos son opcionales
 * Utilizado para cambios de estado, mantenimiento o reconfiguración
 */
export class UpdatePlazaDto {
  /**
   * Número identificativo de la plaza (opcional)
   * Si se cambia, debe mantener unicidad en el sistema
   * Útil para renumeración o reorganización de plazas
   */
  @IsOptional()
  @IsString({ message: 'El número de plaza debe ser una cadena de texto válida' })
  numero_plaza?: string;

  /**
   * Descripción de la ubicación física (opcional)
   * Permite actualizar información de localización
   */
  @IsOptional()
  @IsString({ message: 'La ubicación debe ser una cadena de texto válida' })
  ubicacion?: string;

  /**
   * Estado actual de la plaza (opcional)
   * Usado frecuentemente para cambios de estado operativo
   * LIBRE: Disponible para reservas
   * OCUPADA: Actualmente en uso
   * MANTENIMIENTO: Temporalmente fuera de servicio
   */
  @IsOptional()
  @IsEnum(EstadoPlaza, { 
    message: 'El estado debe ser: libre, ocupada o mantenimiento' 
  })
  estado?: EstadoPlaza;

  /**
   * Tipo de plaza según características especiales (opcional)
   * Permite reconfigurar el tipo de plaza si cambian las instalaciones
   * Ejemplo: convertir plaza normal a plaza con cargador eléctrico
   */
  @IsOptional()
  @IsEnum(TipoPlaza, { 
    message: 'El tipo debe ser: normal, discapacitado o electrico' 
  })
  tipo?: TipoPlaza;
}
