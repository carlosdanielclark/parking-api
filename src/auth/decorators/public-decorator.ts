import { SetMetadata } from '@nestjs/common';

/**
 * Clave utilizada para identificar rutas públicas en metadatos
 * Permite al JwtAuthGuard omitir la validación de autenticación
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorador para marcar endpoints como públicos
 * Los endpoints marcados con @Public() no requieren autenticación JWT
 * Se utiliza para rutas como login, registro y documentación
 * 
 * @returns Decorador que marca el endpoint como público
 * 
 * @example
 * ```typescript
 * // Endpoint público - no requiere autenticación
 * @Public()
 * @Post('login')
 * login(@Body() loginDto: LoginDto) {
 *   return this.authService.login(loginDto);
 * }
 * 
 * // Endpoint público - registro de usuarios
 * @Public()
 * @Post('register')
 * register(@Body() registerDto: RegisterDto) {
 *   return this.authService.register(registerDto);
 * }
 * 
 * // Endpoint protegido - requiere JWT (comportamiento por defecto)
 * @Get('profile')
 * getProfile(@GetUser() user: any) {
 *   return user;
 * }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);