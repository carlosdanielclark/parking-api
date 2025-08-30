// src/plazas/dto/create-plaza.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';
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
  @ApiProperty({ example: 12, description: 'Número visible de plaza' })
  @IsInt({ message: 'numero_plaza debe ser entero' })
  @IsPositive({ message: 'numero_plaza debe ser > 0' })
  numero_plaza: number;
  /**
   * Descripción de la ubicación física de la plaza (opcional)
   * Información adicional para facilitar la localización
   * Ejemplos: "Planta Baja - Sector A", "Nivel 2 - Zona Norte"
   */
  @ApiProperty({ example: 'Nivel -1, Sector B', required: false })
  @IsOptional()
  @IsString({ message: 'ubicacion debe ser texto' })
  @MaxLength(120, { message: 'ubicacion: máx 120 caracteres' })
  ubicacion?: string;
  /**
   * Estado inicial de la plaza (opcional)
   * Por defecto se establece como LIBRE
   * Valores permitidos: LIBRE, OCUPADA, MANTENIMIENTO
   */
  @ApiProperty({ enum: EstadoPlaza, default: EstadoPlaza.LIBRE })
  @IsEnum(EstadoPlaza, { message: 'estado inválido' })
  estado: EstadoPlaza;
  /**
   * Tipo de plaza según características especiales (opcional)
   * Por defecto se establece como NORMAL
   * Valores permitidos: NORMAL, DISCAPACITADO, ELECTRICO
   */
  @ApiProperty({ enum: TipoPlaza })
  @IsEnum(TipoPlaza, { message: 'tipo debe ser uno de: AUTO, MOTO, DISCAPACITADO' })
  tipo: TipoPlaza;
}
