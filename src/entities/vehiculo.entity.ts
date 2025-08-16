import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Reserva } from './reserva.entity';

/**
 * Entidad Vehículo - Representa los vehículos registrados por los usuarios
 * Almacena información identificativa del vehículo para gestionar reservas
 */
@Entity('vehiculos')
export class Vehiculo {
  /**
   * Identificador único del vehículo (UUID v4)
   * Se genera automáticamente al registrar un vehículo
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Placa o matrícula del vehículo
   * Debe ser única en el sistema para evitar conflictos
   * Campo obligatorio para identificación legal del vehículo
   */
  @Column({ length: 20, unique: true })
  placa: string;

  /**
   * Marca del vehículo (ej: Toyota, Ford, BMW)
   * Información descriptiva para facilitar la identificación
   */
  @Column({ length: 50, nullable: true })
  marca?: string;

  /**
   * Modelo específico del vehículo (ej: Corolla, Focus, Serie 3)
   * Complementa la información de marca para mejor identificación
   */
  @Column({ length: 50, nullable: true })
  modelo?: string;

  /**
   * Color del vehículo
   * Ayuda en la identificación visual del vehículo en el parking
   */
  @Column({ length: 30, nullable: true })
  color?: string;

  /**
   * Identificador del usuario propietario del vehículo
   * Clave foránea que referencia la tabla usuarios
   */
  @Column()
  usuario_id: string;

  /**
   * Fecha y hora de registro del vehículo
   * Se establece automáticamente al crear el registro
   */
  @CreateDateColumn()
  created_at: Date;

  /**
   * Relación muchos-a-uno con la entidad User
   * Un vehículo pertenece a un único usuario
   * Un usuario puede tener múltiples vehículos
   */
  @ManyToOne(() => User, user => user.vehiculos, {
    onDelete: 'CASCADE', // Si se elimina el usuario, se eliminan sus vehículos
    onUpdate: 'CASCADE'
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  /**
   * Relación uno-a-muchos con la entidad Reserva
   * Un vehículo puede tener múltiples reservas a lo largo del tiempo
   */
  @OneToMany(() => Reserva, reserva => reserva.vehiculo)
  reservas: Reserva[];
}