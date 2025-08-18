// src/plazas/dto/create-plaza.dto.ts

import { IsString, IsEnum, IsOptional, MinLength } from 'class-validator';
import { EstadoPlaza, TipoPlaza } from '../../entities/plaza.entity';

/**
 * DTO para la creación de nuevas plazas de parking
 * Utilizado por administradores para gestionar espacios de estacionamiento
 * Incluye validaciones para garantizar integridad de datos
 */
export class CreatePlazaDto {
  /**
   * Número identificativo único de la plaza
   * Debe ser único en todo el sistema (ej: "A001", "B015", "C-025")
   * Campo requerido para identificación física de la plaza
   */
  @IsString({ message: 'El número de plaza debe ser una cadena de texto válida' })
  @MinLength(1, { message: 'El número de plaza es requerido' })
  numero_plaza: string;

  /**
   * Descripción de la ubicación física de la plaza (opcional)
   * Información adicional para facilitar la localización
   * Ejemplos: "Planta Baja - Sector A", "Nivel 2 - Zona Norte"
   */
  @IsOptional()
  @IsString({ message: 'La ubicación debe ser una cadena de texto válida' })
  ubicacion?: string;

  /**
   * Estado inicial de la plaza (opcional)
   * Por defecto se establece como LIBRE
   * Valores permitidos: LIBRE, OCUPADA, MANTENIMIENTO
   */
  @IsOptional()
  @IsEnum(EstadoPlaza, { 
    message: 'El estado debe ser: libre, ocupada o mantenimiento' 
  })
  estado?: EstadoPlaza;

  /**
   * Tipo de plaza según características especiales (opcional)
   * Por defecto se establece como NORMAL
   * Valores permitidos: NORMAL, DISCAPACITADO, ELECTRICO
   */
  @IsOptional()
  @IsEnum(TipoPlaza, { 
    message: 'El tipo debe ser: normal, discapacitado o electrico' 
  })
  tipo?: TipoPlaza;
}
