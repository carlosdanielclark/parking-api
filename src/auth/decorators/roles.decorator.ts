import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../entities/user.entity';

/**
 * Clave utilizada para almacenar metadatos de roles requeridos
 * Permite al RolesGuard identificar qué roles necesita un endpoint
 */
export const ROLES_KEY = 'roles';

/**
 * Decorador para especificar roles requeridos en controladores y métodos
 * Funciona en conjunto con RolesGuard para implementar autorización
 * 
 * @param roles - Lista de roles que pueden acceder al endpoint
 * @returns Decorador que establece metadatos de roles
 * 
 * @example
 *  * // Solo administradores pueden acceder
 * @Roles(UserRole.ADMIN)
 * @Get('admin-only')
 * adminOnlyEndpoint() {}
 * 
 * // Administradores y empleados pueden acceder
 * @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
 * @Get('staff-only')
 * staffOnlyEndpoint() {}
 * 
 * // Cualquier usuario autenticado puede acceder (sin @Roles)
 * @Get('all-users')
 * allUsersEndpoint() {}
 *  */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);