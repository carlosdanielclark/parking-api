// src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service'; // corregido import

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const secret = configService.get<string>('jwt.secret') || configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET no está configurado en variables de entorno');
    }

    const options: StrategyOptionsWithoutRequest = {
      /**
       * Extrae el token JWT del header Authorization como Bearer token
       */
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      /**
       * No ignora tokens expirados para mantener seguridad
       */
      ignoreExpiration: false,
      secretOrKey: secret,
    };
    super(options);
  }

  /**
   * Método de validación llamado automáticamente por Passport
   * Se ejecuta después de verificar la firma del token JWT
   * @param payload - Contenido decodificado del token JWT
   * @returns Datos del usuario para adjuntar al request
   */
  async validate(payload: any) {
    this.logger.debug(`Validando token JWT para usuario: ${payload.sub}`);

    // Verificar que el usuario aún existe en la base de datos
    const user = await this.authService.validateUserById(payload.sub);
    if (!user) {
      this.logger.warn(`Token válido pero usuario no encontrado: ${payload.sub}`);
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }
    // Verificar integridad del payload
    if (!payload.sub || !payload.email || !payload.role) {
      this.logger.warn(`Token JWT con payload incompleto: ${JSON.stringify(payload)}`);
      throw new UnauthorizedException('Token malformado');
    }

    this.logger.debug(`Usuario validado exitosamente: ${user.id} - ${user.email}`);
    /**
     * Retorna objeto que se adjuntará a request.user
     * Contiene información esencial del usuario autenticado
     */
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
