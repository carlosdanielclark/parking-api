import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public-decorator';

/**
 * Guard de autenticación JWT personalizado
 * Extiende AuthGuard de Passport para integrar lógica de rutas públicas
 * Se aplica globalmente pero permite excepciones con @Public()
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * Determina si una ruta puede ser accedida
   * Verifica si la ruta es pública antes de aplicar autenticación JWT
   * @param context - Contexto de ejecución de NestJS
   * @returns true si puede acceder, false caso contrario
   */
  canActivate(context: ExecutionContext) {
    // Verificar si la ruta está marcada como pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug('Acceso a ruta pública - omitiendo validación JWT');
      return true;
    }

    // Si no es pública, aplicar validación JWT estándar
    this.logger.debug('Aplicando validación JWT para ruta protegida');
    return super.canActivate(context);
  }

  /**
   * Maneja el resultado de la validación JWT
   * Personaliza el manejo de errores y usuarios no válidos
   * @param err - Error de validación si existe
   * @param user - Usuario validado por JWT Strategy
   * @param info - Información adicional del proceso
   * @returns Usuario validado
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Logging para debugging
    if (err) {
      this.logger.error(`Error de autenticación JWT: ${err.message}`, err.stack);
    }
    
    if (info) {
      this.logger.warn(`Información de autenticación: ${JSON.stringify(info)}`);
    }

    // Si hay error o no hay usuario válido, lanzar excepción
    if (err || !user) {
      const errorMessage = err?.message || info?.message || 'Token JWT inválido o expirado';
      this.logger.warn(`Acceso denegado para ${request.method} ${request.url}: ${errorMessage}`);
      
      throw err || new UnauthorizedException(errorMessage);
    }

    // Logging exitoso de autenticación
    this.logger.debug(`Autenticación exitosa para usuario: ${user.userId} - ${user.email}`);
    
    return user;
  }
}