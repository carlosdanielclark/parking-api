// src/logging/audit.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_ACTION_KEY } from './audit-action.decorator';
import { LoggingService } from './logging.service';
import { LogLevel, LogAction } from '../schemas/log.schema';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly loggingService: LoggingService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> {
    const request = context.switchToHttp().getRequest<Request & any>();
    const response = context.switchToHttp().getResponse<any>();
    const action = (this.reflector.get<string>(AUDIT_ACTION_KEY, context.getHandler())
      ?? this.reflector.get<string>(AUDIT_ACTION_KEY, context.getClass())
      ?? LogAction.SYSTEM_ERROR) as string;

    const start = Date.now();
    return next.handle().pipe(
      tap(async (data) => {
        const duration = Date.now() - start;
        const userId = request?.user?.userId ?? 'anonymous';
        
        // ✅ CORREGIDO: Normalizar resource para que coincida con las expectativas del test
        const rawPath = request?.route?.path ?? '';
        const resource = this.normalizeResourceName(rawPath, request?.method);
        
        const resourceId = request?.params?.id ?? undefined;
        const method = (request as any)?.method;
        const url = (request as any)?.originalUrl ?? (request as any)?.url;
        const statusCode = response?.statusCode;
        const ip = (request as any)?.ip;

        try {
          // ✅ CORREGIDO: Generar mensaje específico según la acción
          let message = `HTTP ${method} ${url}`;
          
          if (action === LogAction.CREATE_RESERVATION && method === 'POST' && url?.includes('/reservas')) {
            const reservaId = data?.data?.id;
            const plazaInfo = data?.data?.plaza?.numero_plaza || data?.data?.plaza?.id;
            message = reservaId && plazaInfo 
              ? `Reserva creada: ${reservaId} - Plaza ${plazaInfo}` 
              : 'Reserva creada';
          }

          await this.loggingService.log(
            LogLevel.INFO,
            action as any,
            message,
            userId,
            resource, // ✅ USAR resource normalizado
            resourceId,
            { body: request?.body, params: request?.params, query: request?.query },
            { method, url, statusCode, responseTime: duration, ip },
          );
        } catch (e) {
          this.logger.warn(`Fallo al auditar request ${method} ${url}: ${e?.message}`);
        }
      }),
    );
  }

  /**
   * ✅ NUEVO: Método para normalizar nombres de recursos
   * Convierte rutas de API en nombres de recursos esperados por los tests
   */
  private normalizeResourceName(path: string, method: string): string {
    // Remover parámetros de ruta como :id
    const cleanPath = path.replace(/:\w+/g, '');
    
    // Mapeo específico de rutas a nombres de recursos
    const resourceMap: Record<string, string> = {
      '/reservas': 'reserva',
      '/reservas/': 'reserva',
      '/users': 'user',
      '/users/': 'user',
      '/plazas': 'plaza',
      '/plazas/': 'plaza',
      '/vehiculos': 'vehiculo',
      '/vehiculos/': 'vehiculo',
      '/admin/logs': 'logs',
      '/admin/logs/': 'logs'
    };

    // Buscar coincidencia exacta primero
    if (resourceMap[cleanPath]) {
      return resourceMap[cleanPath];
    }

    // Si no hay coincidencia, extraer el primer segmento y normalizarlo
    const segments = cleanPath.split('/').filter(s => s.length > 0);
    if (segments.length > 0) {
      let resourceName = segments[0];
      
      // Convertir plural a singular para consistency
      if (resourceName.endsWith('s') && resourceName.length > 1) {
        resourceName = resourceName.slice(0, -1);
      }
      
      return resourceName;
    }

    // Fallback por defecto
    return 'system';
  }
}
