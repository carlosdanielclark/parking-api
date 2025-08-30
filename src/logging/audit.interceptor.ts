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
      tap(async () => {
        const duration = Date.now() - start;
        const userId = request?.user?.userId ?? 'anonymous';
        const resource = request?.route?.path ?? '';
        const resourceId = request?.params?.id ?? undefined;
        const method = (request as any)?.method;
        const url = (request as any)?.originalUrl ?? (request as any)?.url;
        const statusCode = response?.statusCode;
        const ip = (request as any)?.ip;

        try {
          await this.loggingService.log(
            LogLevel.INFO,
            action as any,
            `HTTP ${method} ${url}`,
            userId,
            resource,
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
}
