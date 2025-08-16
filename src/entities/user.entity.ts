import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Vehiculo } from './vehiculo.entity';
import { Reserva } from './reserva.entity';

/**
 * Enum que define los roles disponibles en el sistema
 * - ADMIN: Acceso completo al sistema, puede gestionar usuarios y acceder a logs
 * - EMPLEADO: Puede consultar ocupación del parking y gestionar reservas
 * - CLIENTE: Puede crear reservas y gestionar sus vehículos
 */
export enum UserRole {
  ADMIN = 'admin',
  EMPLEADO = 'empleado',
  CLIENTE = 'cliente'
}

/**
 * Entidad Usuario - Representa todos los actores del sistema (admin, empleado, cliente)
 * Almacena información personal y credenciales de autenticación
 */
@Entity('usuarios')
export class User {
  /**
   * Identificador único del usuario (UUID v4)
   * Se genera automáticamente al crear un nuevo registro
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Nombre completo del usuario
   * Campo obligatorio con longitud máxima de 255 caracteres
   */
  @Column({ length: 255 })
  nombre: string;

  /**
   * Dirección de correo electrónico del usuario
   * Campo único y obligatorio para el login del sistema
   */
  @Column({ length: 255, unique: true })
  email: string;

  /**
   * Número de teléfono del usuario
   * Campo opcional para contacto
   */
  @Column({ length: 20, nullable: true })
  telefono?: string;

  /**
   * Contraseña encriptada del usuario
   * Se almacena usando bcrypt para seguridad
   */
  @Column({ length: 255 })
  password: string;

  /**
   * Rol del usuario en el sistema
   * Define los permisos y accesos disponibles
   */
  @Column({ 
    type: 'enum',
    enum: UserRole,
    default: UserRole.CLIENTE 
  })
  role: UserRole;

  /**
   * Fecha y hora de creación del registro
   * Se establece automáticamente al crear el usuario
   */
  @CreateDateColumn()
  created_at: Date;

  /**
   * Fecha y hora de última actualización del registro
   * Se actualiza automáticamente en cada modificación
   */
  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Relación uno-a-muchos con la entidad Vehículo
   * Un usuario puede tener múltiples vehículos registrados
   */
  @OneToMany(() => Vehiculo, vehiculo => vehiculo.usuario)
  vehiculos: Vehiculo[];

  /**
   * Relación uno-a-muchos con la entidad Reserva
   * Un usuario puede tener múltiples reservas activas o históricas
   */
  @OneToMany(() => Reserva, reserva => reserva.usuario)
  reservas: Reserva[];
}