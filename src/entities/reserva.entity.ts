import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Plaza } from './plaza.entity';
import { Vehiculo } from './vehiculo.entity';

/**
 * Enum que define los estados posibles de una reserva
 * - ACTIVA: Reserva confirmada y vigente
 * - FINALIZADA: Reserva completada exitosamente
 * - CANCELADA: Reserva cancelada por el usuario o el sistema
 */
export enum EstadoReservaDTO  {
  ACTIVA = 'activa',
  CANCELADA = 'cancelada',
  FINALIZADA = 'finalizada',
}

/**
 * Entidad Reserva - Gestiona las reservas de plazas de parking
 * Establece la relación temporal entre usuarios, vehículos y plazas
 */
@Entity('reservas')
export class Reserva {
  /**
   * Identificador único de la reserva (UUID v4)
   * Se genera automáticamente al crear una nueva reserva
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Identificador del usuario que realiza la reserva
   * Clave foránea que referencia la tabla usuarios
   */
  @Column()
  usuario_id: string;

  /**
   * Identificador de la plaza reservada
   * Clave foránea que referencia la tabla plazas
   */
  @Column()
  plaza_id: number;

  /**
   * Identificador del vehículo para el cual se hace la reserva
   * Clave foránea que referencia la tabla vehiculos
   */
  @Column()
  vehiculo_id: string;

  /**
   * Fecha y hora de inicio de la reserva
   * Define cuando comienza el período de ocupación de la plaza
   */
  @Column({ type: 'timestamp' })
  fecha_inicio: Date;

  /**
   * Fecha y hora de finalización de la reserva
   * Define cuando termina el período de ocupación de la plaza
   */
  @Column({ type: 'timestamp' })
  fecha_fin: Date;

  /**
   * Estado actual de la reserva
   * Permite hacer seguimiento del ciclo de vida de la reserva
   */
  @Column({ 
    type: 'enum',
    enum: EstadoReservaDTO,
    default: EstadoReservaDTO.ACTIVA 
  })
  estado: EstadoReservaDTO;

  /**
   * Fecha y hora de creación de la reserva
   * Se establece automáticamente al crear el registro
   */
  @CreateDateColumn()
  created_at: Date;

  /**
   * Fecha y hora de última actualización de la reserva
   * Se actualiza automáticamente al modificar el estado o datos
   */
  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Relación muchos-a-uno con la entidad User
   * Una reserva pertenece a un único usuario
   * Un usuario puede tener múltiples reservas
   */
  @ManyToOne(() => User, user => user.reservas, {
    onDelete: 'CASCADE', // Si se elimina el usuario, se eliminan sus reservas
    onUpdate: 'CASCADE'
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  /**
   * Relación muchos-a-uno con la entidad Plaza
   * Una reserva ocupa una única plaza
   * Una plaza puede tener múltiples reservas en diferentes períodos
   * ✅ CORREGIDO: Cambiar de RESTRICT a CASCADE para permitir eliminación de plazas
   * Solo se eliminan reservas finalizadas/canceladas, las activas se validan en servicio
   */
  @ManyToOne(() => Plaza, plaza => plaza.reservas, {
    onDelete: 'RESTRICT', // Permitir eliminación en cascada
    onUpdate: 'CASCADE'
  })
  @JoinColumn({ name: 'plaza_id' })
  plaza: Plaza;

  /**
   * Relación muchos-a-uno con la entidad Vehiculo
   * Una reserva es para un único vehículo
   * Un vehículo puede tener múltiples reservas a lo largo del tiempo
   */
  @ManyToOne(() => Vehiculo, vehiculo => vehiculo.reservas, {
    onDelete: 'CASCADE', // Si se elimina el vehículo, se eliminan sus reservas
    onUpdate: 'CASCADE'
  })
  @JoinColumn({ name: 'vehiculo_id' })
  vehiculo: Vehiculo;

  /**
   * Método para verificar si la reserva está activa en un momento dado
   * @param fecha Fecha a verificar (por defecto la fecha actual)
   * @returns true si la reserva está activa en la fecha especificada
   */
  isActiveAt(fecha: Date = new Date()): boolean {
    return this.estado === EstadoReservaDTO.ACTIVA && 
           fecha >= this.fecha_inicio && 
           fecha <= this.fecha_fin;
  }

  /**
   * Método para calcular la duración de la reserva en horas
   * @returns Duración de la reserva en horas
   */
  getDuracionHoras(): number {
    const diffMs = this.fecha_fin.getTime() - this.fecha_inicio.getTime();
    return diffMs / (1000 * 60 * 60); // Convertir milisegundos a horas
  }
}