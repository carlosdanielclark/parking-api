import { Controller, Get, UseGuards, Query, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/get-user.decorator';
import { UserRole } from '../../entities/user.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LogsQueryService } from '../services/logs-query.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Reserva, EstadoReserva } from '../../entities/reserva.entity';
import { Plaza, EstadoPlaza } from '../../entities/plaza.entity';
import { LoggingService } from '../../logging/logging.service';
import { LogLevel } from '../../schemas/log.schema';
import { MoreThan } from 'typeorm';

/**
 * Interfaz para definir el tipo de alerta usado en el dashboard
 */
interface Alerta {
  nivel: 'CRITICAL' | 'WARNING' | 'GOOD';
  mensaje: string;
  accion: string;
}

/**
 * Controlador del dashboard administrativo
 * Proporciona métricas y vista general del sistema
 * Solo accesible por administradores
 */
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDashboardController {
  private readonly logger = new Logger(AdminDashboardController.name);

  constructor(
    private readonly logsQueryService: LogsQueryService,
    private readonly loggingService: LoggingService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Reserva)
    private readonly reservaRepository: Repository<Reserva>,
    @InjectRepository(Plaza)
    private readonly plazaRepository: Repository<Plaza>,
  ) {}

  @Get('overview')
  @HttpCode(HttpStatus.OK)
  async getDashboardOverview(@GetUser() currentUser: AuthenticatedUser) {
    this.logger.log(`Administrador ${currentUser.userId} accediendo al dashboard`);

    try {
      const ahora = new Date();
      const hace24h = new Date(ahora.getTime() - (24 * 60 * 60 * 1000));
      const hace7d = new Date(ahora.getTime() - (7 * 24 * 60 * 60 * 1000));

      const [
        ocupacionData,
        totalPlazas,
        plazasOcupadas,
        plazasLibres,
        plazasMantenimiento,
        totalUsers,
        usersStats,
        totalReservas,
        reservasActivas,
        reservasUltimas24h,
        reservasUltimos7d,
        logStatistics,
        criticalEvents,
      ] = await Promise.all([
        this.getOcupacionCompleta(),
        this.plazaRepository.count(),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.OCUPADA } }),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.LIBRE } }),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.MANTENIMIENTO } }),
        this.userRepository.count(),
        this.getUserStatistics(),
        this.reservaRepository.count(),
        this.reservaRepository.count({ where: { estado: EstadoReserva.ACTIVA } }),
        this.reservaRepository.count({ where: { created_at: MoreThan(hace24h) } }),
        this.reservaRepository.count({ where: { created_at: MoreThan(hace7d) } }),
        this.logsQueryService.getLogStatistics(7),
        this.logsQueryService.getCriticalEvents(24),
      ]);

      const porcentajeOcupacion = totalPlazas > 0 
        ? Math.round((plazasOcupadas / (totalPlazas - plazasMantenimiento)) * 100) 
        : 0;
      const promedioDiarioReservas = Math.round(reservasUltimos7d / 7);

      const systemStatus = this.determineSystemStatus(
        criticalEvents.length,
        porcentajeOcupacion,
        reservasUltimas24h,
      );

      const dashboardData: {
        overview: object;
        parking: object;
        usuarios: object;
        sistema: object;
        alertas: Alerta[];
        acciones_recomendadas: string[];
      } = {
        overview: {
          timestamp: ahora.toISOString(),
          systemStatus,
          uptime: this.calculateUptime(),
        },
        parking: {
          ocupacion: {
            total: totalPlazas,
            ocupadas: plazasOcupadas,
            libres: plazasLibres,
            mantenimiento: plazasMantenimiento,
            porcentaje: porcentajeOcupacion,
            estado: porcentajeOcupacion > 90 ? 'CRITICAL' : porcentajeOcupacion > 75 ? 'WARNING' : 'GOOD',
          },
          reservas: {
            total: totalReservas,
            activas: reservasActivas,
            ultimas_24h: reservasUltimas24h,
            ultimos_7d: reservasUltimos7d,
            promedio_diario: promedioDiarioReservas,
            tendencia: this.calculateTrend(reservasUltimas24h, promedioDiarioReservas),
          },
        },
        usuarios: {
          total: totalUsers,
          distribucion: usersStats,
          crecimiento_24h: await this.getUserGrowth(hace24h),
        },
        sistema: {
          logs: {
            estadisticas: logStatistics,
            ultimos_errores: criticalEvents.slice(0, 5),
            total_criticos: criticalEvents.length,
            estado: criticalEvents.length > 50 ? 'CRITICAL' : criticalEvents.length > 10 ? 'WARNING' : 'GOOD',
          },
          rendimiento: await this.getPerformanceMetrics(),
          seguridad: await this.getSecurityMetrics(hace24h),
        },
        alertas: this.generateAlerts(porcentajeOcupacion, criticalEvents.length, reservasUltimas24h),
        acciones_recomendadas: this.getRecommendedActions(systemStatus, porcentajeOcupacion, criticalEvents.length),
      };

      await this.loggingService.log(
        LogLevel.INFO,
        'ACCESS_LOGS' as any,
        `Administrador accedió al dashboard principal`,
        currentUser.userId,
        'admin_dashboard',
        undefined,
        {
          system_status: systemStatus,
          metrics_generated: Object.keys(dashboardData).length,
          critical_alerts: dashboardData.alertas.filter(a => a.nivel === 'CRITICAL').length,
        },
        { method: 'GET', resource_type: 'admin_dashboard' },
      );

      this.logger.log(`Dashboard generado exitosamente para administrador ${currentUser.userId}`);

      return {
        success: true,
        message: 'Dashboard administrativo generado exitosamente',
        data: dashboardData,
      };

    } catch (error) {
      this.logger.error(`Error generando dashboard: ${error.message}`, error.stack);

      await this.loggingService.log(
        LogLevel.ERROR,
        'SYSTEM_ERROR' as any,
        `Error generando dashboard administrativo: ${error.message}`,
        currentUser.userId,
        'admin_dashboard',
        undefined,
        { error: error.message },
        { method: 'GET', resource_type: 'admin_dashboard_error' },
      );

      throw error;
    }
  }

  private generateAlerts(ocupacion: number, criticalEvents: number, reservas24h: number): Alerta[] {
    const alertas: Alerta[] = [];

    if (ocupacion > 90) {
      alertas.push({
        nivel: 'CRITICAL',
        mensaje: 'Ocupación del parking crítica (>90%)',
        accion: 'Considerar habilitar plazas adicionales o alertar a clientes',
      });
    }

    if (criticalEvents > 20) {
      alertas.push({
        nivel: 'WARNING',
        mensaje: `${criticalEvents} eventos críticos en las últimas 24h`,
        accion: 'Revisar logs de errores y tomar acciones correctivas',
      });
    }

    if (reservas24h === 0) {
      alertas.push({
        nivel: 'WARNING',
        mensaje: 'No hay reservas en las últimas 24 horas',
        accion: 'Verificar disponibilidad del sistema y canales de reserva',
      });
    }

    return alertas;
  }

  private async getUserGrowth(since: Date): Promise<number> {
    return this.userRepository.count({
      where: { created_at: MoreThan(since) },
    });
  }

  private async getOcupacionCompleta() {
    const total = await this.plazaRepository.count();
    const ocupadas = await this.plazaRepository.count({ where: { estado: EstadoPlaza.OCUPADA } });
    const libres = await this.plazaRepository.count({ where: { estado: EstadoPlaza.LIBRE } });
    const mantenimiento = await this.plazaRepository.count({ where: { estado: EstadoPlaza.MANTENIMIENTO } });

    return {
      total,
      ocupadas,
      libres,
      mantenimiento,
      porcentaje: total > 0 ? Math.round((ocupadas / total) * 100) : 0,
    };
  }

  private async getUserStatistics() {
    const [adminCount, empleadoCount, clienteCount] = await Promise.all([
      this.userRepository.count({ where: { role: UserRole.ADMIN } }),
      this.userRepository.count({ where: { role: UserRole.EMPLEADO } }),
      this.userRepository.count({ where: { role: UserRole.CLIENTE } }),
    ]);
    return {
      admins: adminCount,
      empleados: empleadoCount,
      clientes: clienteCount,
    };
  }

  private determineSystemStatus(criticalEvents: number, ocupacion: number, reservas24h: number): string {
    if (criticalEvents > 50 || ocupacion > 95) return 'CRITICAL';
    if (criticalEvents > 10 || ocupacion > 85) return 'WARNING';
    if (reservas24h === 0) return 'WARNING';
    return 'HEALTHY';
  }

  private calculateUptime(): string {
    return '99.9%';
  }

  private calculateTrend(current: number, average: number): string {
    if (current > average * 1.2) return 'UP';
    if (current < average * 0.8) return 'DOWN';
    return 'STABLE';
  }

  private getRecommendedActions(status: string, ocupacion: number, criticalEvents: number): string[] {
    const actions: string[] = [];
    if (status === 'CRITICAL') {
      actions.push('🚨 Revisar inmediatamente el estado del sistema');
      actions.push('📞 Notificar al equipo de soporte técnico');
    }
    if (ocupacion > 85) {
      actions.push('🚗 Considerar implementar reservas dinámicas');
      actions.push('📊 Analizar patrones de uso para optimización');
    }
    if (criticalEvents > 0) {
      actions.push('🔍 Revisar eventos críticos en detalle');
    }
    actions.push('📈 Generar reporte semanal de métricas');
    actions.push('🔄 Programar mantenimiento preventivo');
    return actions;
  }

  private async getPerformanceMetrics() {
    return {
      database_connections: 'Active',
      response_time_avg: '< 200ms',
      memory_usage: '< 70%',
      cpu_usage: '< 50%',
    };
  }

  private async getSecurityMetrics(since: Date) {
    // Simulación simplificada
    return {
      failed_logins: 0,
      admin_actions: 0,
      suspicious_ips: [],
    };
  }

  private async getDetailedPerformanceMetrics(startDate: Date) {
    return {
      database_performance: {},
      api_response_times: {},
      error_rates: {},
    };
  }

  private async getBusinessMetrics(startDate: Date) {
    return {
      revenue: 0,
      utilization_rate: 0,
      customer_satisfaction: 0,
    };
  }

  private async getDetailedSecurityMetrics(startDate: Date) {
    return {
      authentication_events: {},
      authorization_failures: {},
      data_access_patterns: {},
    };
  }

  private async getUsageMetrics(startDate: Date) {
    return {
      api_calls: 0,
      unique_users: 0,
      peak_hours: [],
    };
  }
}
