// src/plazas/services/ocupacion.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plaza, EstadoPlaza, TipoPlaza } from '../../entities/plaza.entity';
import { Reserva, EstadoReservaDTO } from '../../entities/reserva.entity';

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
    plaza_numero: string;
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

export interface HistorialOcupacion {
  fecha: string;
  reservas_del_dia: number;
  duracion_promedio_minutos: number;
  pico_ocupacion_hora: number;
  plaza_mas_usada: string;
}

@Injectable()
export class OcupacionService {
  private readonly logger = new Logger(OcupacionService.name);

  constructor(
    @InjectRepository(Plaza)
    private readonly plazaRepository: Repository<Plaza>,
    @InjectRepository(Reserva)
    private readonly reservaRepository: Repository<Reserva>,
  ) {}

  async getOcupacionCompleta(): Promise<OcupacionDetallada> {
    this.logger.log('Calculando ocupación completa del parking');

    try {
      const [total, ocupadas, libres, mantenimiento] = await Promise.all([
        this.plazaRepository.count(),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.OCUPADA } }),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.LIBRE } }),
        this.plazaRepository.count({ where: { estado: EstadoPlaza.MANTENIMIENTO } }),
      ]);

      const plazasOperativas = total - mantenimiento;
      const porcentajeOcupacion = plazasOperativas > 0 ?
        Math.round((ocupadas / plazasOperativas) * 100) : 0;

      const plazasPorTipo = await this.getEstadisticasPorTipo();

      const reservasActivas = await this.reservaRepository.count({
        where: { estado: EstadoReservaDTO.ACTIVA }
      });

      const proximasLiberaciones = await this.getProximasLiberaciones();

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


  private async getProximasLiberaciones() {
    const ahora = new Date();
    const dosPosHoras = new Date(ahora.getTime() + (2 * 60 * 60 * 1000));
    
    this.logger.debug(`Buscando liberaciones entre ${ahora.toISOString()} y ${dosPosHoras.toISOString()}`);

    const proximasReservas = await this.reservaRepository
      .createQueryBuilder('reserva')
      .leftJoinAndSelect('reserva.plaza', 'plaza')
      .leftJoinAndSelect('reserva.vehiculo', 'vehiculo')
      .where('reserva.estado = :estado', { estado: EstadoReservaDTO.ACTIVA })
      .andWhere('reserva.fecha_fin BETWEEN :ahora AND :limite', {
        ahora: ahora,
        limite: dosPosHoras
      })
      .orderBy('reserva.fecha_fin', 'ASC')
      .getMany();

    const proximasLiberaciones = proximasReservas.map(reserva => {
      const tiempoRestante = Math.round(
        (reserva.fecha_fin.getTime() - ahora.getTime()) / (1000 * 60)
      );

      return {
        plaza_numero: reserva.plaza.numero_plaza.toString(),
        fecha_liberacion: reserva.fecha_fin,
        tiempo_restante_minutos: tiempoRestante,
        vehiculo_placa: reserva.vehiculo?.placa || 'N/A',
      };
    });

    this.logger.debug(`Encontradas ${proximasLiberaciones.length} próximas liberaciones`);
    
    return proximasLiberaciones;
  }

  private async getTendenciaOcupacion() {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    const fechaInicioSemana = new Date(ahora.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const reservasHistoricas = await this.reservaRepository
      .createQueryBuilder('reserva')
      .select('EXTRACT(HOUR FROM reserva.fecha_inicio)', 'hora')
      .addSelect('COUNT(*)', 'cantidad')
      .where('reserva.fecha_inicio >= :inicio', { inicio: fechaInicioSemana })
      .andWhere('reserva.estado IN (:...estados)', { 
        estados: [EstadoReservaDTO.ACTIVA, EstadoReservaDTO.FINALIZADA] 
      })
      .groupBy('EXTRACT(HOUR FROM reserva.fecha_inicio)')
      .getRawMany();

    const datosHora = reservasHistoricas.find(r => parseInt(r.hora) === horaActual);
    const promedioSemanal = reservasHistoricas.reduce((sum, r) => sum + parseInt(r.cantidad), 0) / 
      (reservasHistoricas.length || 1);
    
    const promedioHoraActual = datosHora ? parseInt(datosHora.cantidad) : 0;
    
    const datosProximaHora = reservasHistoricas.find(r => 
      parseInt(r.hora) === ((horaActual + 1) % 24)
    );
    const prediccionProximaHora = datosProximaHora ? parseInt(datosProximaHora.cantidad) : promedioSemanal;

    return {
      hora_actual: promedioHoraActual,
      promedio_semanal: Math.round(promedioSemanal),
      prediccion_proxima_hora: Math.round(prediccionProximaHora),
    };
  }

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

  async getHistorialOcupacion(dias: number = 7): Promise<HistorialOcupacion[]> {
    this.logger.log(`Generando historial de ocupación para ${dias} días`);

    try {
      const historial = await this.reservaRepository
        .createQueryBuilder('reserva')
        .leftJoin('reserva.plaza', 'plaza')
        .select('DATE(reserva.fecha_inicio)', 'fecha')
        .addSelect('COUNT(*)', 'reservas_del_dia')
        .addSelect('AVG(TIMESTAMPDIFF(MINUTE, reserva.fecha_inicio, reserva.fecha_fin))', 'duracion_promedio_minutos')
        .where('reserva.fecha_inicio >= DATE_SUB(NOW(), INTERVAL :dias DAY)', { dias })
        .groupBy('DATE(reserva.fecha_inicio)')
        .orderBy('fecha', 'DESC')
        .getRawMany();

      const historialProcesado = await Promise.all(
        historial.map(async (dia) => {
          const reservasDelDia = await this.reservaRepository
            .createQueryBuilder('reserva')
            .select('EXTRACT(HOUR FROM reserva.fecha_inicio)', 'hora')
            .addSelect('COUNT(*)', 'cantidad')
            .where('DATE(reserva.fecha_inicio) = :fecha', { fecha: dia.fecha })
            .groupBy('EXTRACT(HOUR FROM reserva.fecha_inicio)')
            .orderBy('cantidad', 'DESC')
            .getRawOne();

          const plazaMasUsada = await this.reservaRepository
            .createQueryBuilder('reserva')
            .leftJoin('reserva.plaza', 'plaza')
            .select('plaza.numero_plaza', 'numero_plaza')
            .addSelect('COUNT(*)', 'usos')
            .where('DATE(reserva.fecha_inicio) = :fecha', { fecha: dia.fecha })
            .groupBy('plaza.numero_plaza')
            .orderBy('usos', 'DESC')
            .getRawOne();

          return {
            fecha: dia.fecha,
            reservas_del_dia: parseInt(dia.reservas_del_dia),
            duracion_promedio_minutos: Math.round(parseFloat(dia.duracion_promedio_minutos) || 0),
            pico_ocupacion_hora: reservasDelDia ? parseInt(reservasDelDia.hora) : 0,
            plaza_mas_usada: plazaMasUsada?.numero_plaza || 'N/A',
          };
        })
      );

      this.logger.log(`Historial generado para ${historialProcesado.length} días`);
      
      return historialProcesado;

    } catch (error) {
      this.logger.error(`Error al generar historial de ocupación: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al generar historial de ocupación');
    }
  }
}
