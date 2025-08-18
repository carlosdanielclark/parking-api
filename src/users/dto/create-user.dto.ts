// src/users/dto/create-user.dto.ts

import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '../../entities/user.entity';

/**
 * DTO para la creación de nuevos usuarios
 * Utilizado por administradores para crear usuarios con roles específicos
 * Incluye validaciones robustas para todos los campos requeridos
 */
export class CreateUserDto {
  /**
   * Nombre completo del usuario
   * Debe tener al menos 2 caracteres para evitar nombres inválidos
   */
  @IsString({ message: 'El nombre debe ser una cadena de texto válida' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  nombre: string;

  /**
   * Dirección de correo electrónico del usuario
   * Debe ser un email válido y será único en el sistema
   */
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  email: string;

  /**
   * Contraseña del usuario
   * Debe tener al menos 6 caracteres para seguridad básica
   */
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  /**
   * Número de teléfono opcional del usuario
   * Campo opcional para información de contacto adicional
   */
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto válida' })
  telefono?: string;

  /**
   * Rol del usuario en el sistema
   * Define los permisos y accesos disponibles (ADMIN, EMPLEADO, CLIENTE)
   */
  @IsEnum(UserRole, { message: 'El rol debe ser: admin, empleado o cliente' })
  role: UserRole;
}
