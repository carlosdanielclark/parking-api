import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '../../entities/user.entity';

/**
 * DTO para el registro de nuevos usuarios en el sistema
 * Valida datos de entrada para creación de cuentas
 * Aplicable a clientes, empleados y administradores
 */
export class RegisterDto {
  /**
   * Nombre completo del usuario
   * Mínimo 2 caracteres para validez
   */
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  nombre: string;

  /**
   * Dirección de correo electrónico
   * Debe ser única en el sistema y formato válido
   */
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  email: string;

  /**
   * Contraseña del usuario
   * Mínimo 6 caracteres para seguridad básica
   */
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  /**
   * Número de teléfono opcional
   * Para contacto y notificaciones
   */
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  telefono?: string;
}