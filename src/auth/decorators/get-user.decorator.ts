import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorador personalizado para extraer información del usuario autenticado
 * Simplifica el acceso a datos del usuario colocados por JwtAuthGuard
 * Proporciona tipado y validación automática
 */
export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    // Extraer request del contexto HTTP
    const request = ctx.switchToHttp().getRequest();
    
    // Obtener usuario del request (colocado por JwtAuthGuard)
    const user = request.user;

    /**
     * Si se especifica una propiedad específica, retornar solo esa propiedad
     * Si no se especifica, retornar el objeto usuario completo
     * 
     * @example
     *      * // Obtener usuario completo
     * getUserProfile(@GetUser() user: any) {
     *   // user = { userId: 'uuid', email: 'user@email.com', role: 'cliente' }
     * }
     * 
     * // Obtener solo el ID del usuario
     * getUserById(@GetUser('userId') userId: string) {
     *   // userId = 'uuid'
     * }
     * 
     * // Obtener solo el email del usuario
     * getUserEmail(@GetUser('email') email: string) {
     *   // email = 'user@email.com'
     * }
     * 
     * // Obtener solo el rol del usuario
     * getUserRole(@GetUser('role') role: UserRole) {
     *   // role = UserRole.CLIENTE
     * }
     *      */
    return data ? user?.[data] : user;
  },
);

/**
 * Interface TypeScript para el tipo de usuario extraído por JwtStrategy
 * Proporciona tipado estático para mejor desarrollo
 */
export interface AuthenticatedUser {
  /**
   * ID único del usuario autenticado
   */
  userId: string;
  
  /**
   * Email del usuario autenticado
   */
  email: string;
  
  /**
   * Rol del usuario en el sistema
   */
  role: string;
}