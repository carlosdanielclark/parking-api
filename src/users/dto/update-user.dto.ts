// src/users/dto/update-user.dto.ts

import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '../../entities/user.entity';

/**
 * DTO para la actualización de usuarios existentes
 * Permite actualización parcial de campos, todos los campos son opcionales
 * Implementa lógica de autorización: solo admins pueden cambiar roles
 */
export class UpdateUserDto {
  /**
   * Nombre completo del usuario (opcional)
   * Si se proporciona, debe tener al menos 2 caracteres
   */
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto válida' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  nombre?: string;

  /**
   * Dirección de correo electrónico del usuario (opcional)
   * Si se cambia, debe mantener unicidad en el sistema
   */
  @IsOptional()
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  email?: string;

  /**
   * Nueva contraseña del usuario (opcional)
   * Si se proporciona, debe tener al menos 6 caracteres y será encriptada
   */
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password?: string;

  /**
   * Número de teléfono del usuario (opcional)
   * Puede ser actualizado por el usuario o administrador
   */
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto válida' })
  telefono?: string;

  /**
   * Rol del usuario en el sistema (opcional)
   * Solo puede ser modificado por administradores
   * Se valida en el servicio antes de aplicar cambios
   */
  @IsOptional()
  @IsEnum(UserRole, { message: 'El rol debe ser: admin, empleado o cliente' })
  role?: UserRole;
}
