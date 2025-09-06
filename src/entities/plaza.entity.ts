// src/entities/plaza.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { Reserva } from './reserva.entity';

/**
 * Enum que define los estados posibles de una plaza de parking
 * - LIBRE: Plaza disponible para ser reservada
 * - OCUPADA: Plaza actualmente en uso por un vehículo
 * - MANTENIMIENTO: Plaza temporalmente fuera de servicio
 */
export enum EstadoPlaza {
  LIBRE = 'libre',
  OCUPADA = 'ocupada',
  MANTENIMIENTO = 'mantenimiento',
}

/**
 * Enum que define los tipos de plaza según características especiales
 * - NORMAL: Plaza estándar para cualquier vehículo
 * - DISCAPACITADO: Plaza reservada para personas con discapacidad
 * - ELECTRICO: Plaza equipada con punto de carga para vehículos eléctricos
 */
export enum TipoPlaza {
  NORMAL = 'normal',
  DISCAPACITADO = 'discapacitado',
  ELECTRICO = 'electrico'
}

/**
 * Entidad Plaza - Representa cada espacio de estacionamiento disponible
 * Contiene información sobre ubicación, estado y características especiales
 */
@Entity('plazas')
export class Plaza {
  /**
   * Identificador único numérico de la plaza
   * Se auto-incrementa para facilitar la gestión física del parking
   */
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Número identificativo de la plaza visible físicamente
   * Debe ser único en todo el sistema (ej: "A001", "B015")
   */
  @Column({ 
    type: 'varchar', 
    length: 5, 
    unique: true,
    comment: 'Número único identificativo de la plaza'
  })
  numero_plaza: string;

  /**
   * Descripción de la ubicación física de la plaza
   * Información adicional para facilitar la localización
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  ubicacion?: string;

  /**
   * Estado actual de la plaza
   * Determina si está disponible para reservas
   */
  @Column({ type: 'enum', enum: EstadoPlaza, default: EstadoPlaza.LIBRE })
  estado: EstadoPlaza;

  /**
   * Tipo de plaza según características especiales
   * Permite filtrar plazas con requerimientos específicos
   */
  @Column({ type: 'enum', enum: TipoPlaza, default: TipoPlaza.NORMAL })
  tipo: TipoPlaza;

  /**
   * Fecha y hora de creación del registro
   * Se establece automáticamente al registrar la plaza
   */
  @CreateDateColumn()
  created_at: Date;

  /**
   * Relación uno-a-muchos con la entidad Reserva
   * Una plaza puede tener múltiples reservas a lo largo del tiempo
   * pero solo una activa simultáneamente
   */
  @OneToMany(() => Reserva, reserva => reserva.plaza)
  reservas: Reserva[];
}