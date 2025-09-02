// src/plazas/services/ocupacion.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Plaza, EstadoPlaza, TipoPlaza } from '../../entities/plaza.entity';
import { Reserva, EstadoReservaDTO } from '../../entities/reserva.entity';

/**
 * Interface para estadísticas detalladas de ocupación
 */
export interface OcupacionDetallada {
  total: number;
  ocupadas: number;
  libres: number;
  mantenimiento: number;
  porcentajeOcupacion: number;
  plazasPorTipo: {
    normal: { total: number; libres: number; ocupadas: number };
    discapacitado: { total: number; libres: number; ocupadas: number };
    electrico: { total: number; libres: number; ocupadas: number };
  };
  reservasActivas: number;
  proximasLiberaciones: Array<{
    plaza_numero: number;
    fecha_liberacion: Date;
    tiempo_restante_minutos: number;
    vehiculo_placa?: string;
  }>;
  tendenciaOcupacion: {
    hora_actual: number;
    promedio_semanal: number;
    prediccion_proxima_hora: number;
  };
}

/**
 * Interface para historial de ocupación por día
 */
export interface HistorialOcupacion {
  fecha: string;
  reservas_del_dia: number;
  duracion_promedio_minutos: number;
  pico_ocupacion_hora: number;
  plaza_mas_usada: number;
}

/**
 * Interface para tendencias de ocupación
 */
export interface TendenciasOcupacion {
  por_hora: Array<{
    hora: number;
    promedio_ocupacion: number;
    reservas_promedio: number;
  }>;
  por_dia_semana: Array<{
    dia: string;
    promedio_ocupacion: number;
    reservas_promedio: number;
  }>;
  picos_ocupacion: {
    hora_pico: number;
    porcentaje_pico: number;
    hora_valle: number;
    porcentaje_valle: number;
  };
}

/**
 * Interface para alertas de ocupación
 */
export interface AlertaOcupacion {
  tipo: 'HIGH_OCCUPANCY' | 'MAINTENANCE_REQUIRED' | 'LOW_AVAILABILITY' | 'RESERVATION_CONFLICT';
  severidad: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  mensaje: string;
  detalles: any;
  timestamp: Date;
}

/**
 * Servicio especializado para análisis de ocupación del parking
 * Implementa el caso de uso: Empleado desea conocer la ocupación actual del parking
 * Proporciona estadísticas avanzadas, tendencias y alertas operativas
 */
@Injectable()
export class OcupacionService {
  private readonly logger = new Logger(OcupacionService.name);

  constructor(
    @InjectRepository(Plaza)
    private readonly plazaRepository: Repository<Plaza>,
    @InjectRepository(Reserva)
    private readonly reservaRepository: Repository<Reserva>,
  ) {}

  /**
   * Obtener ocupación completa del parking con análisis avanzado
   * Caso de uso principal: consulta detallada de ocupación
   * 
   * @returns Estadísticas completas de ocupación con tendencias
   */
  async getOcupacionCompleta(): Promise<OcupacionDetallada> {
    this.logger.log('Calculando ocupación completa del parking');

    try {
      // Consultas paralelas para optimizar rendimiento
      const [total, ocupadas, libres, mantenimiento] = await Promise.all([
        this.plazaRepository.count(),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.OCUPADA } }),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.LIBRE } }),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.MANTENIMIENTO } }),
      ]);

      const plazasOperativas = total - mantenimiento;
      const porcentajeOcupacion = plazasOperativas > 0 ?
        Math.round((ocupadas / plazasOperativas) * 100) : 0;

      // Obtener estadísticas por tipo de plaza
      const plazasPorTipo = await this.getEstadisticasPorTipo();

      // Contar reservas activas
      const reservasActivas = await this.reservaRepository.count({
        where: { estado: EstadoReservaDTO.ACTIVA }
      });

      // Obtener próximas liberaciones
      const proximasLiberaciones = await this.getProximasLiberaciones();

      // Calcular tendencia de ocupación
      const tendenciaOcupacion = await this.getTendenciaOcupacion();

      const resultado: OcupacionDetallada = {
        total,
        ocupadas,
        libres,
        mantenimiento,
        porcentajeOcupacion,
        plazasPorTipo,
        reservasActivas,
        proximasLiberaciones,
        tendenciaOcupacion,
      };

      this.logger.log(`Ocupación calculada: ${ocupadas}/${total} plazas (${porcentajeOcupacion}%)`);
      
      return resultado;

    } catch (error) {
      this.logger.error(`Error al calcular ocupación: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener estadísticas de ocupación');
    }
  }

  /**
   * Obtener plazas disponibles para reserva
   * 
   * @param tipo - Tipo específico de plaza (opcional)
   * @returns Lista de plazas disponibles
   */
  async getPlazasDisponibles(tipo?: TipoPlaza): Promise<Plaza[]> {
    this.logger.log(`Obteniendo plazas disponibles${tipo ? ` de tipo ${tipo}` : ''}`);

    try {
      const whereCondition: any = { estado: EstadoPlaza.LIBRE };
      if (tipo) {
        whereCondition.tipo = tipo;
      }

      const plazasDisponibles = await this.plazaRepository.find({
        where: whereCondition,
        order: { numero_plaza: 'ASC' }
      });

      this.logger.log(`Se encontraron ${plazasDisponibles.length} plazas disponibles`);
      
      return plazasDisponibles;

    } catch (error) {
      this.logger.error(`Error al obtener plazas disponibles: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener plazas disponibles');
    }
  }

  /**
   * Obtener historial de ocupación por días
   * 
   * @param dias - Número de días hacia atrás
   * @returns Historial de ocupación
   */
  async getHistorialOcupacion(dias: number = 7): Promise<HistorialOcupacion[]> {
    this.logger.log(`Generando historial de ocupación para ${dias} días`);

    try {
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - dias);
      fechaInicio.setHours(0, 0, 0, 0);

      const fechaFin = new Date();
      fechaFin.setHours(23, 59, 59, 999);

      // Obtener reservas del período
      const reservasPeriodo = await this.reservaRepository.find({
        where: {
          created_at: Between(fechaInicio, fechaFin)
        },
        relations: ['plaza', 'vehiculo'],
        order: { created_at: 'ASC' }
      });

      // Procesar datos por día
      const historialPorDia = new Map<string, {
        reservas: Reserva[];
        fecha: Date;
      }>();

      // Agrupar reservas por día
      reservasPeriodo.forEach(reserva => {
        const fechaReserva = reserva.created_at.toISOString().split('T')[0];
        if (!historialPorDia.has(fechaReserva)) {
          historialPorDia.set(fechaReserva, {
            reservas: [],
            fecha: new Date(fechaReserva)
          });
        }
        historialPorDia.get(fechaReserva)!.reservas.push(reserva);
      });

      // Generar estadísticas por día
      const historial: HistorialOcupacion[] = [];
      
      for (let i = 0; i < dias; i++) {
        const fecha = new Date(fechaInicio);
        fecha.setDate(fecha.getDate() + i);
        const fechaStr = fecha.toISOString().split('T')[0];
        
        const datosDia = historialPorDia.get(fechaStr);
        const reservasDelDia = datosDia?.reservas || [];

        // Calcular duración promedio
        let duracionPromedio = 0;
        if (reservasDelDia.length > 0) {
          const duracionTotal = reservasDelDia.reduce((sum, reserva) => {
            if (reserva.fecha_fin && reserva.fecha_inicio) {
              return sum + (reserva.fecha_fin.getTime() - reserva.fecha_inicio.getTime());
            }
            return sum;
          }, 0);
          duracionPromedio = Math.round(duracionTotal / (reservasDelDia.length * 1000 * 60)); // minutos
        }

        // Encontrar hora pico y plaza más usada
        const horaPico = this.calcularHoraPico(reservasDelDia);
        const plazaMasUsada = this.calcularPlazaMasUsada(reservasDelDia);

        historial.push({
          fecha: fechaStr,
          reservas_del_dia: reservasDelDia.length,
          duracion_promedio_minutos: duracionPromedio,
          pico_ocupacion_hora: horaPico,
          plaza_mas_usada: plazaMasUsada,
        });
      }

      this.logger.log(`Historial generado para ${historial.length} días`);
      return historial;

    } catch (error) {
      this.logger.error(`Error al generar historial: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al generar historial de ocupación');
    }
  }

  /**
   * Obtener tendencias de ocupación por horas y días
   * 
   * @returns Análisis de tendencias
   */
  async getTendenciasOcupacion(): Promise<TendenciasOcupacion> {
    this.logger.log('Calculando tendencias de ocupación');

    try {
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - 30); // Últimos 30 días

      const reservas = await this.reservaRepository.find({
        where: {
          created_at: Between(fechaInicio, new Date())
        },
        relations: ['plaza']
      });

      // Análisis por hora
      const porHora = this.analizarTendenciasPorHora(reservas);
      
      // Análisis por día de la semana
      const porDiaSemana = this.analizarTendenciasPorDia(reservas);

      // Calcular picos de ocupación
      const picos = this.calcularPicosOcupacion(porHora);

      const tendencias: TendenciasOcupacion = {
        por_hora: porHora,
        por_dia_semana: porDiaSemana,
        picos_ocupacion: picos,
      };

      this.logger.log('Tendencias calculadas exitosamente');
      return tendencias;

    } catch (error) {
      this.logger.error(`Error al calcular tendencias: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al calcular tendencias');
    }
  }

  /**
   * Obtener alertas de ocupación del sistema
   * 
   * @returns Lista de alertas actuales
   */
  async getAlertasOcupacion(): Promise<AlertaOcupacion[]> {
    this.logger.log('Generando alertas de ocupación');

    try {
      const alertas: AlertaOcupacion[] = [];

      // Verificar alta ocupación
      const ocupacion = await this.getOcupacionCompleta();
      if (ocupacion.porcentajeOcupacion >= 90) {
        alertas.push({
          tipo: 'HIGH_OCCUPANCY',
          severidad: 'HIGH',
          mensaje: `Ocupación crítica: ${ocupacion.porcentajeOcupacion}% del parking ocupado`,
          detalles: {
            ocupadas: ocupacion.ocupadas,
            total: ocupacion.total,
            disponibles: ocupacion.libres
          },
          timestamp: new Date(),
        });
      } else if (ocupacion.porcentajeOcupacion >= 75) {
        alertas.push({
          tipo: 'HIGH_OCCUPANCY',
          severidad: 'MEDIUM',
          mensaje: `Ocupación alta: ${ocupacion.porcentajeOcupacion}% del parking ocupado`,
          detalles: {
            ocupadas: ocupacion.ocupadas,
            total: ocupacion.total,
            disponibles: ocupacion.libres
          },
          timestamp: new Date(),
        });
      }

      // Verificar plazas en mantenimiento
      if (ocupacion.mantenimiento > 0) {
        const severidad = ocupacion.mantenimiento > 5 ? 'HIGH' : 'MEDIUM';
        alertas.push({
          tipo: 'MAINTENANCE_REQUIRED',
          severidad,
          mensaje: `${ocupacion.mantenimiento} plazas en mantenimiento`,
          detalles: {
            plazas_mantenimiento: ocupacion.mantenimiento,
            porcentaje_afectado: Math.round((ocupacion.mantenimiento / ocupacion.total) * 100)
          },
          timestamp: new Date(),
        });
      }

      // Verificar baja disponibilidad por tipo
      const tiposConBajaDisponibilidad = Object.entries(ocupacion.plazasPorTipo)
        .filter(([, stats]) => {
          const porcentajeDisponible = stats.total > 0 ? (stats.libres / stats.total) * 100 : 0;
          return porcentajeDisponible < 20;
        });

      tiposConBajaDisponibilidad.forEach(([tipo, stats]) => {
        alertas.push({
          tipo: 'LOW_AVAILABILITY',
          severidad: 'MEDIUM',
          mensaje: `Baja disponibilidad en plazas de tipo ${tipo}`,
          detalles: {
            tipo,
            total: stats.total,
            libres: stats.libres,
            porcentaje_disponible: Math.round((stats.libres / stats.total) * 100)
          },
          timestamp: new Date(),
        });
      });

      this.logger.log(`Se generaron ${alertas.length} alertas`);
      return alertas;

    } catch (error) {
      this.logger.error(`Error al generar alertas: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al generar alertas');
    }
  }

  // MÉTODOS PRIVADOS AUXILIARES

  /**
   * Obtener estadísticas por tipo de plaza
   */
  private async getEstadisticasPorTipo() {
    const tipos = [TipoPlaza.NORMAL, TipoPlaza.DISCAPACITADO, TipoPlaza.ELECTRICO];
    const estadisticas = {
      normal: { total: 0, libres: 0, ocupadas: 0 },
      discapacitado: { total: 0, libres: 0, ocupadas: 0 },
      electrico: { total: 0, libres: 0, ocupadas: 0 },
    };

    for (const tipo of tipos) {
      const [total, libres, ocupadas] = await Promise.all([
        this.plazaRepository.count({ where: { tipo } }),
        this.plazaRepository.count({ where: { tipo, estado: EstadoPlaza.LIBRE } }),
        this.plazaRepository.count({ where: { tipo, estado: EstadoPlaza.OCUPADA } }),
      ]);

      estadisticas[tipo] = { total, libres, ocupadas };
    }

    return estadisticas;
  }

  /**
   * Obtener próximas liberaciones de plazas
   */
  private async getProximasLiberaciones() {
    const reservasActivas = await this.reservaRepository.find({
      where: { estado: EstadoReservaDTO.ACTIVA },
      relations: ['plaza', 'vehiculo'],
      order: { fecha_fin: 'ASC' },
      take: 10 // Próximas 10 liberaciones
    });

    const ahora = new Date();
    
    return reservasActivas.map(reserva => {
      const tiempoRestante = Math.max(0, reserva.fecha_fin.getTime() - ahora.getTime());
      const minutosRestantes = Math.round(tiempoRestante / (1000 * 60));

      return {
        plaza_numero: Number(reserva.plaza.numero_plaza),
        fecha_liberacion: reserva.fecha_fin,
        tiempo_restante_minutos: minutosRestantes,
        vehiculo_placa: reserva.vehiculo?.placa || "N/A",
      };
    });
  }

  /**
   * Calcular tendencia de ocupación
   */
  private async getTendenciaOcupacion() {
    // Simplificado para el ejemplo
    const horaActual = new Date().getHours();
    
    return {
      hora_actual: horaActual,
      promedio_semanal: 65, // Esto debería calcularse con datos reales
      prediccion_proxima_hora: 70, // Esto debería ser un algoritmo predictivo
    };
  }

  /**
   * Calcular hora pico de un conjunto de reservas
   */
  private calcularHoraPico(reservas: Reserva[]): number {
    const contadorHoras = new Array(24).fill(0);
    
    reservas.forEach(reserva => {
      const hora = reserva.fecha_inicio.getHours();
      contadorHoras[hora]++;
    });

    const horaMaxima = contadorHoras.indexOf(Math.max(...contadorHoras));
    return horaMaxima;
  }

  /**
   * Calcular plaza más usada
   */
  private calcularPlazaMasUsada(reservas: Reserva[]): number {
    const contadorPlazas = new Map<number, number>();
    
    reservas.forEach(reserva => {
      const plazaId = Number(reserva.plaza.numero_plaza);
      contadorPlazas.set(plazaId, (contadorPlazas.get(plazaId) || 0) + 1);
    });

    let plazaMasUsada = 0;
    let maxUsos = 0;
    
    contadorPlazas.forEach((usos, plazaId) => {
      if (usos > maxUsos) {
        maxUsos = usos;
        plazaMasUsada = plazaId;
      }
    });

    return plazaMasUsada;
  }

  /**
   * Analizar tendencias por hora
   */
  private analizarTendenciasPorHora(reservas: Reserva[]) {
    const estadisticasPorHora = new Array(24).fill(null).map(() => ({
      reservas: 0,
      ocupacion: 0
    }));

    reservas.forEach(reserva => {
      const hora = reserva.fecha_inicio.getHours();
      estadisticasPorHora[hora].reservas++;
    });

    return estadisticasPorHora.map((stats, hora) => ({
      hora,
      promedio_ocupacion: Math.round((stats.reservas / Math.max(1, reservas.length)) * 100),
      reservas_promedio: stats.reservas,
    }));
  }

  /**
   * Analizar tendencias por día de la semana
   */
  private analizarTendenciasPorDia(reservas: Reserva[]) {
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const estadisticasPorDia = new Array(7).fill(null).map(() => ({
      reservas: 0
    }));

    reservas.forEach(reserva => {
      const dia = reserva.fecha_inicio.getDay();
      estadisticasPorDia[dia].reservas++;
    });

    return estadisticasPorDia.map((stats, index) => ({
      dia: diasSemana[index],
      promedio_ocupacion: Math.round((stats.reservas / Math.max(1, reservas.length)) * 100),
      reservas_promedio: stats.reservas,
    }));
  }

  /**
   * Calcular picos de ocupación
   */
  private calcularPicosOcupacion(porHora: Array<{hora: number; promedio_ocupacion: number}>) {
    const ocupacionMaxima = Math.max(...porHora.map(h => h.promedio_ocupacion));
    const ocupacionMinima = Math.min(...porHora.map(h => h.promedio_ocupacion));
    
    const horaPico = porHora.find(h => h.promedio_ocupacion === ocupacionMaxima)?.hora || 12;
    const horaValle = porHora.find(h => h.promedio_ocupacion === ocupacionMinima)?.hora || 3;

    return {
      hora_pico: horaPico,
      porcentaje_pico: ocupacionMaxima,
      hora_valle: horaValle,
      porcentaje_valle: ocupacionMinima,
    };
  }
}