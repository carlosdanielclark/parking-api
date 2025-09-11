import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggingService } from '../../logging/logging.service';
import { LogAction, LogLevel } from '../../schemas/log.schema';

/**
 * Middleware de auditoría para operaciones administrativas sensibles
 * Registra todos los accesos a endpoints de administración de logs
 * Incluye métricas de rendimiento y contexto detallado
 */
@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);

  constructor(private readonly loggingService: LoggingService) {}

  /**
   * Procesa las requests a endpoints administrativos
   * Registra acceso, rendimiento y respuesta para auditoría
   * 
   * @param req Request de Express
   * @param res Response de Express  
   * @param next Función next de Express
   */
  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    
    // Capturar información detallada de la request
    const requestInfo = this.extractRequestInfo(req);
    
    // Obtener usuario del contexto JWT (si está disponible)
    const user = (req as any).user;
    
    this.logger.debug(`Admin access attempt: ${requestInfo.method} ${requestInfo.url} by ${user?.userId || 'unknown'}`);

    // Override del método res.end para capturar la respuesta
    const originalEnd = res.end;
    const originalJson = res.json;
    
    let responseData: any = null;
    
    // Interceptar res.json para capturar datos de respuesta
    res.json = function(data: any) {
      responseData = data;
      return originalJson.call(this, data);
    };

    res.end = function(chunk?: any, encoding?: any) {
      const responseTime = Date.now() - startTime;
      const responseInfo = {
        statusCode: res.statusCode,
        responseTime,
        contentLength: res.get('content-length') || 0,
      };
      
      // Log de acceso administrativo en segundo plano
      if (requestInfo.url.includes('/admin/logs')) {
        setImmediate(async () => {
          try {
            await this.logAdminAccess(requestInfo, responseInfo, user, responseData);
          } catch (error) {
            this.logger.error('Error logging admin access:', error);
          }
        });
      }
      
      return originalEnd.call(this, chunk, encoding);
    }.bind(this);
    
    next();
  }

  /**
   * Extrae información relevante de la request
   * 
   * @param req Request de Express
   * @returns Objeto con información de la request
   */
  private extractRequestInfo(req: Request) {
    const { method, url, ip, headers, query, params } = req;
    
    return {
      method,
      url,
      ip: this.getClientIp(req),
      userAgent: headers['user-agent'] || 'Unknown',
      contentType: headers['content-type'] || 'Unknown',
      acceptLanguage: headers['accept-language'] || 'Unknown',
      referer: headers['referer'] || 'Direct',
      queryParams: query,
      routeParams: params,
      timestamp: new Date(),
    };
  }

  /**
   * Obtiene la IP real del cliente considerando proxies
   * 
   * @param req Request de Express
   * @returns Dirección IP del cliente
   */
  private getClientIp(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'Unknown'
    ).split(',')[0].trim();
  }

  /**
   * Registra el acceso administrativo en el sistema de logs
   * 
   * @param requestInfo Información de la request
   * @param responseInfo Información de la response
   * @param user Usuario autenticado
   * @param responseData Datos de respuesta (si disponibles)
   */
  private async logAdminAccess(
    requestInfo: any,
    responseInfo: any,
    user: any,
    responseData: any
  ) {
    try {
      const adminAction = this.extractAdminAction(requestInfo.url);
      const isSuccessful = responseInfo.statusCode >= 200 && responseInfo.statusCode < 300;
      
      await this.loggingService.log(
        isSuccessful ? LogLevel.INFO : LogLevel.WARN,
        LogAction.ACCESS_LOGS,
        `Acceso administrativo: ${adminAction}`,
        user?.userId || 'unknown',
        'admin_panel',
        undefined,
        {
          admin_action: adminAction,
          ip: requestInfo.ip,
          userAgent: requestInfo.userAgent,
          query_params: requestInfo.queryParams,
          route_params: requestInfo.routeParams,
          success: isSuccessful,
          records_affected: responseData?.data?.length || responseData?.count || 0,
          export_format: requestInfo.queryParams?.format,
          filter_applied: Object.keys(requestInfo.queryParams || {}).length > 0,
          content_type: requestInfo.contentType,
          referer: requestInfo.referer,
        },
        {
          method: requestInfo.method,
          url: requestInfo.url,
          statusCode: responseInfo.statusCode,
          responseTime: responseInfo.responseTime,
          contentLength: responseInfo.contentLength,
          admin_operation: true,
          sensitive_data_access: this.isSensitiveDataAccess(requestInfo.url),
          high_privilege_action: this.isHighPrivilegeAction(adminAction),
        }
      );

      // Log adicional para operaciones de alta sensibilidad
      if (this.isHighPrivilegeAction(adminAction)) {
        await this.loggingService.log(
          LogLevel.WARN,
          LogAction.ACCESS_LOGS,
          `Operación administrativa de alta sensibilidad ejecutada`,
          user?.userId || 'unknown',
          'high_privilege_operation',
          undefined,
          {
            operation: adminAction,
            ip: requestInfo.ip,
            timestamp: new Date(),
            user_context: {
              userId: user?.userId,
              email: user?.email,
              role: user?.role,
            },
          },
          {
            method: requestInfo.method,
            url: requestInfo.url,
            critical_operation: true,
            requires_review: true,
          }
        );
      }

    } catch (error) {
      this.logger.error(`Error registrando acceso administrativo: ${error.message}`, error.stack);
    }
  }

  /**
   * Extrae la acción administrativa de la URL
   * 
   * @param url URL de la request
   * @returns Tipo de acción administrativa
   */
  private extractAdminAction(url: string): string {
    if (url.includes('/export')) return 'export_logs';
    if (url.includes('/statistics')) return 'view_statistics';
    if (url.includes('/critical')) return 'view_critical_events';
    if (url.includes('/health')) return 'system_health_check';
    if (url.includes('/dashboard')) return 'view_dashboard';
    if (url.match(/\/admin\/logs\/\d+/)) return 'view_specific_log';
    if (url.includes('/admin/logs')) return 'query_logs';
    return 'unknown_admin_action';
  }

  /**
   * Determina si la URL accede a datos sensibles
   * 
   * @param url URL de la request
   * @returns true si accede a datos sensibles
   */
  private isSensitiveDataAccess(url: string): boolean {
    return (
      url.includes('/export') ||
      url.includes('/critical') ||
      url.includes('/statistics') ||
      url.includes('/health')
    );
  }

  /**
   * Determina si la acción requiere privilegios altos
   * 
   * @param action Acción administrativa
   * @returns true si requiere privilegios altos
   */
  private isHighPrivilegeAction(action: string): boolean {
    const highPrivilegeActions = [
      'export_logs',
      'view_critical_events',
      'system_health_check',
      'cleanup_logs',
    ];
    
    return highPrivilegeActions.includes(action);
  }
}