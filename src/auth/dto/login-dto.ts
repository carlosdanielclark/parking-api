import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * DTO para el inicio de sesión de usuarios
 * Valida credenciales para autenticación en el sistema
 * Utilizado por todos los tipos de usuarios (admin, empleado, cliente)
 */
export class LoginDto {
  /**
   * Dirección de correo electrónico del usuario
   * Debe corresponder a un usuario registrado en el sistema
   */
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  email: string;

  /**
   * Contraseña del usuario
   * Se validará contra el hash almacenado en la base de datos
   */
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(1, { message: 'La contraseña es requerida' })
  password: string;
}