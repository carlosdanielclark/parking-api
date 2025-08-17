import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../entities/user.entity';
import { ROLES_KEY } from '../decorators/roles-decorator';

/**
 * Guard de autorización basado en roles
 * Verifica que el usuario autenticado tenga los permisos necesarios
 * Se aplica después de JwtAuthGuard para validar roles específicos
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  /**
   * Determina si el usuario tiene los roles requeridos
   * Se ejecuta después de la autenticación JWT exitosa
   * @param context - Contexto de ejecución de NestJS
   * @returns true si tiene permisos, false caso contrario
   */
  canActivate(context: ExecutionContext): boolean {
    // Obtener roles requeridos de los metadatos del decorador @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si no se requieren roles específicos, permitir acceso
    if (!requiredRoles || requiredRoles.length === 0) {
      this.logger.debug('No se requieren roles específicos - acceso permitido');
      return true;
    }

    // Obtener usuario del request (debe ser colocado por JwtAuthGuard)
    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      this.logger.warn('RolesGuard ejecutado sin usuario autenticado');
      throw new ForbiddenException('Usuario no autenticado para verificación de roles');
    }

    // Verificar si el usuario tiene alguno de los roles requeridos
    const hasRequiredRole = requiredRoles.some((role) => user.role === role);
    
    if (!hasRequiredRole) {
      this.logger.warn(
        `Acceso denegado para usuario ${user.userId} (${user.email}) con rol ${user.role}. ` +
        `Roles requeridos: ${requiredRoles.join(', ')}`
      );
      
      throw new ForbiddenException(
        `Acceso denegado. Roles requeridos: ${requiredRoles.join(', ')}`
      );
    }

    this.logger.debug(
      `Autorización exitosa para usuario ${user.userId} con rol ${user.role}. ` +
      `Roles requeridos: ${requiredRoles.join(', ')}`
    );

    return true;
  }

  /**
   * Método utilitario para verificar jerarquía de roles
   * Admin puede acceder a funciones de empleado y cliente
   * Empleado puede acceder a funciones de cliente
   * @param userRole - Rol actual del usuario
   * @param requiredRoles - Roles requeridos para la operación
   * @returns true si el rol del usuario satisface los requisitos
   */
  private hasRoleHierarchy(userRole: UserRole, requiredRoles: UserRole[]): boolean {
    // Definir jerarquía de roles
    const roleHierarchy = {
      [UserRole.ADMIN]: [UserRole.ADMIN, UserRole.EMPLEADO, UserRole.CLIENTE],
      [UserRole.EMPLEADO]: [UserRole.EMPLEADO, UserRole.CLIENTE],
      [UserRole.CLIENTE]: [UserRole.CLIENTE],
    };

    const userPermissions = roleHierarchy[userRole] || [];
    
    // Verificar si alguno de los roles requeridos está en los permisos del usuario
    return requiredRoles.some(role => userPermissions.includes(role));
  }
}