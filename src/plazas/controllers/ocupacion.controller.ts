// src/plazas/controllers/ocupacion.controller.ts
import { Controller, Get, Query, UseGuards, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { OcupacionService } from '../services/ocupacion.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { TipoPlaza } from '../../entities/plaza.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

/**
 * Controlador especializado para consultas de ocupación del parking
 * Caso de uso: Empleado desea conocer la ocupación actual del parking
 * Implementa endpoints optimizados para consultas operativas
 */
@Controller('ocupacion')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OcupacionController {
  private readonly logger = new Logger(OcupacionController.name);

  constructor(private readonly ocupacionService: OcupacionService) {}

  /**
   * Obtener ocupación completa del parking
   * Endpoint: GET /ocupacion
   * Acceso: Administradores y empleados
   * Caso de uso principal: consulta de ocupación por empleados
   * 
   * @returns Estadísticas detalladas de ocupación con tendencias
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async getOcupacionCompleta() {
    this.logger.log('Solicitud de ocupación completa del parking');
    
    try {
      const ocupacion = await this.ocupacionService.getOcupacionCompleta();
      
      this.logger.log(`Ocupación consultada: ${ocupacion.ocupadas}/${ocupacion.total} plazas (${ocupacion.porcentajeOcupacion}%)`);
      
      return {
        success: true,
        message: 'Estadísticas de ocupación obtenidas exitosamente',
        data: ocupacion,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error al obtener ocupación completa: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener plazas disponibles para reserva
   * Endpoint: GET /ocupacion/disponibles?tipo=electrico
   * Acceso: Todos los usuarios autenticados
   * 
   * @param tipo - Tipo específico de plaza (opcional)
   * @returns Lista de plazas disponibles
   */
  @Get('disponibles')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO, UserRole.CLIENTE)
  @HttpCode(HttpStatus.OK)
  async getPlazasDisponibles(@Query('tipo') tipo?: TipoPlaza) {
    this.logger.log(`Solicitud de plazas disponibles${tipo ? ` de tipo ${tipo}` : ''}`);
    
    try {
      const plazasDisponibles = await this.ocupacionService.getPlazasDisponibles(tipo);
      
      this.logger.log(`Se encontraron ${plazasDisponibles.length} plazas disponibles`);
      
      return {
        success: true,
        message: `Plazas disponibles${tipo ? ` de tipo ${tipo}` : ''} obtenidas exitosamente`,
        data: plazasDisponibles,
        count: plazasDisponibles.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error al obtener plazas disponibles: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener historial de ocupación
   * Endpoint: GET /ocupacion/historial?dias=7
   * Acceso: Administradores y empleados
   * 
   * @param dias - Número de días hacia atrás (default: 7)
   * @returns Historial de ocupación por días
   */
  @Get('historial')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async getHistorialOcupacion(@Query('dias') dias?: number) {
    const diasParaConsultar = dias || 7;
    this.logger.log(`Solicitud de historial de ocupación para ${diasParaConsultar} días`);
    
    try {
      const historial = await this.ocupacionService.getHistorialOcupacion(diasParaConsultar);
      
      this.logger.log(`Historial generado para ${historial.length} días`);
      
      return {
        success: true,
        message: `Historial de ocupación para ${diasParaConsultar} días obtenido exitosamente`,
        data: historial,
        count: historial.length,
        period: {
          dias: diasParaConsultar,
          desde: new Date(Date.now() - diasParaConsultar * 24 * 60 * 60 * 1000).toISOString(),
          hasta: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`Error al obtener historial de ocupación: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener tendencias de ocupación por horas
   * Endpoint: GET /ocupacion/tendencias
   * Acceso: Administradores y empleados
   * 
   * @returns Análisis de tendencias por franja horaria
   */
  @Get('tendencias')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async getTendenciasOcupacion() {
    this.logger.log('Solicitud de tendencias de ocupación');
    
    try {
      const tendencias = await this.ocupacionService.getTendenciasOcupacion();
      
      this.logger.log('Tendencias de ocupación calculadas exitosamente');
      
      return {
        success: true,
        message: 'Tendencias de ocupación obtenidas exitosamente',
        data: tendencias,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error al obtener tendencias: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener alertas de ocupación
   * Endpoint: GET /ocupacion/alertas
   * Acceso: Administradores y empleados
   * 
   * @returns Alertas sobre el estado del parking
   */
  @Get('alertas')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async getAlertasOcupacion() {
    this.logger.log('Solicitud de alertas de ocupación');
    
    try {
      const alertas = await this.ocupacionService.getAlertasOcupacion();
      
      this.logger.log(`Se generaron ${alertas.length} alertas de ocupación`);
      
      return {
        success: true,
        message: 'Alertas de ocupación obtenidas exitosamente',
        data: alertas,
        count: alertas.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error al obtener alertas de ocupación: ${error.message}`, error.stack);
      throw error;
    }
  }
}