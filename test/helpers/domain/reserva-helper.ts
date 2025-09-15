// Archivo: test/helpers/domain/reserva-helper.ts
// NUEVO - Helper especializado para operaciones con reservas
import request from 'supertest';
import { logStepV3 } from '../log/log-util';

/**
 * Helper especializado para operaciones con reservas
 * Maneja la creación, modificación y cancelación de reservas
 */
export class ReservaHelper {
  /**
   * Crear una reserva con validaciones
   */
  static async crearReserva(
    app: any,
    token: string,
    data: {
      usuario_id: string;
      plaza_id: number;
      vehiculo_id: string;
      fecha_inicio: string | Date;
      fecha_fin: string | Date;
    }
  ) {
    const payload = {
      usuario_id: data.usuario_id,
      plaza_id: data.plaza_id, // Campo alineado con backend
      vehiculo_id: data.vehiculo_id, // Campo alineado con backend
      fecha_inicio: data.fecha_inicio,
      fecha_fin: data.fecha_fin,
    };

    // Validación básica de fechas
    const inicio = new Date(payload.fecha_inicio);
    const fin = new Date(payload.fecha_fin);

    if (fin <= inicio) {
      throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    logStepV3(`📅 Creando reserva plaza_id=${payload.plaza_id}, vehiculo_id=${payload.vehiculo_id}`, { 
      etiqueta: 'RESERVA_HELPER' 
    });

    try {
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      logStepV3(`✅ Reserva creada id=${response.body.data.id}`, { 
        etiqueta: 'RESERVA_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3(`❌ Error creando reserva:`, { 
        etiqueta: 'RESERVA_HELPER', 
        tipo: 'error' 
      }, {
        payload,
        error: error?.response?.body,
        status: error?.status
      });
      throw error;
    }
  }

  /**
   * Cancelar una reserva de forma segura
   */
  static async cancelarReserva(
    app: any, 
    adminToken: string, 
    reservaId: string
  ): Promise<boolean> {
    try {
      await request(app.getHttpServer())
        .post(`/reservas/${reservaId}/cancelar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(10000)
        .expect(200);
      
      logStepV3(`🛑 Reserva cancelada ${reservaId}`, { 
        etiqueta: 'RESERVA_HELPER' 
      });
      return true;
      
    } catch (error: any) {
      if (error?.status === 404) {
        logStepV3(`Reserva no existe ${reservaId} (ignorar)`, { 
          etiqueta: 'RESERVA_HELPER', 
          tipo: 'warning' 
        });
        return true; // Considerar como éxito si ya no existe
      }
      
      logStepV3(`Error cancelar reserva ${reservaId}: ${error.message}`, { 
        etiqueta: 'RESERVA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      return false;
    }
  }

  /**
   * Crear reserva en el futuro
   */
  static async crearReservaFutura(
    app: any,
    token: string,
    data: {
      usuario_id: string;
      plaza_id: number;
      vehiculo_id: string;
      horasEnElFuturo?: number;
      duracionHoras?: number;
    }
  ) {
    const horasEnElFuturo = data.horasEnElFuturo || 2;
    const duracionHoras = data.duracionHoras || 1;

    const fechaInicio = new Date();
    fechaInicio.setHours(fechaInicio.getHours() + horasEnElFuturo);

    const fechaFin = new Date(fechaInicio);
    fechaFin.setHours(fechaFin.getHours() + duracionHoras);

    return this.crearReserva(app, token, {
      usuario_id: data.usuario_id,
      plaza_id: data.plaza_id,
      vehiculo_id: data.vehiculo_id,
      fecha_inicio: fechaInicio.toISOString(),
      fecha_fin: fechaFin.toISOString(),
    });
  }

  /**
   * Crear reserva inmediata (activa)
   */
  static async crearReservaActiva(
    app: any,
    token: string,
    data: {
      usuario_id: string;
      plaza_id: number;
      vehiculo_id: string;
      duracionHoras?: number;
    }
  ) {
    const duracionHoras = data.duracionHoras || 2;

    const fechaInicio = new Date();
    fechaInicio.setMinutes(fechaInicio.getMinutes() - 5); // Comenzó hace 5 minutos

    const fechaFin = new Date(fechaInicio);
    fechaFin.setHours(fechaFin.getHours() + duracionHoras);

    return this.crearReserva(app, token, {
      usuario_id: data.usuario_id,
      plaza_id: data.plaza_id,
      vehiculo_id: data.vehiculo_id,
      fecha_inicio: fechaInicio.toISOString(),
      fecha_fin: fechaFin.toISOString(),
    });
  }

  /**
   * Crear múltiples reservas para simular ocupación
   */
  static async crearMultiplesReservas(
    app: any,
    token: string,
    reservasData: Array<{
      usuario_id: string;
      plaza_id: number;
      vehiculo_id: string;
      horasEnElFuturo?: number;
      duracionHoras?: number;
    }>
  ) {
    const reservas: any[] = [];

    for (let i = 0; i < reservasData.length; i++) {
      const reservaData = reservasData[i];
      
      // Espaciar las reservas en el tiempo
      const horasOffset = (reservaData.horasEnElFuturo || 0) + (i * 0.5);
      
      const reserva = await this.crearReservaFutura(app, token, {
        ...reservaData,
        horasEnElFuturo: horasOffset,
      });
      
      reservas.push(reserva);
      
      // Pausa pequeña entre creaciones
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logStepV3(`📅 Creadas ${reservas.length} reservas múltiples`, { 
      etiqueta: 'RESERVA_HELPER' 
    });

    return reservas;
  }

  /**
   * Obtener reservas por usuario
   */
  static async getReservasUsuario(
    app: any,
    token: string,
    usuarioId: string
  ) {
    try {
      const response = await request(app.getHttpServer())
        .get(`/reservas?usuario_id=${usuarioId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      logStepV3(`📋 Obtenidas ${response.body.data.length} reservas del usuario ${usuarioId}`, { 
        etiqueta: 'RESERVA_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3(`Error obteniendo reservas del usuario ${usuarioId}:`, { 
        etiqueta: 'RESERVA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Obtener reservas activas
   */
  static async getReservasActivas(
    app: any,
    token: string
  ) {
    try {
      const response = await request(app.getHttpServer())
        .get('/reservas/activas')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      logStepV3(`📋 Obtenidas ${response.body.data.length} reservas activas`, { 
        etiqueta: 'RESERVA_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3('Error obteniendo reservas activas:', { 
        etiqueta: 'RESERVA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Finalizar reserva (check-out)
   */
  static async finalizarReserva(
    app: any,
    token: string,
    reservaId: string
  ) {
    try {
      const response = await request(app.getHttpServer())
        .post(`/reservas/${reservaId}/finalizar`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      logStepV3(`✅ Reserva finalizada ${reservaId}`, { 
        etiqueta: 'RESERVA_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3(`Error finalizando reserva ${reservaId}:`, { 
        etiqueta: 'RESERVA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Extender reserva
   */
  static async extenderReserva(
    app: any,
    token: string,
    reservaId: string,
    horasExtension: number
  ) {
    try {
      const response = await request(app.getHttpServer())
        .patch(`/reservas/${reservaId}/extender`)
        .set('Authorization', `Bearer ${token}`)
        .send({ horas: horasExtension })
        .expect(200);

      logStepV3(`⏰ Reserva ${reservaId} extendida ${horasExtension} horas`, { 
        etiqueta: 'RESERVA_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3(`Error extendiendo reserva ${reservaId}:`, { 
        etiqueta: 'RESERVA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Simular ocupación del parking con porcentaje específico
   */
  static async simularOcupacion(
    app: any,
    token: string,
    clientesData: Array<{
      userId: string;
      vehiculoId: string;
      token: string;
    }>,
    plazas: any[],
    porcentajeOcupacion: number = 0.7
  ) {
    const plazasAOcupar = Math.floor(plazas.length * porcentajeOcupacion);
    const reservas: any[] = [];

    logStepV3(`🎯 Simulando ocupación del ${(porcentajeOcupacion * 100).toFixed(0)}%`, { 
      etiqueta: 'RESERVA_HELPER' 
    }, {
      totalPlazas: plazas.length,
      plazasAOcupar
    });

    for (let i = 0; i < plazasAOcupar && i < clientesData.length; i++) {
      const cliente = clientesData[i % clientesData.length];
      const plaza = plazas[i];

      try {
        const reserva = await this.crearReservaActiva(app, cliente.token, {
          usuario_id: cliente.userId,
          plaza_id: plaza.id,
          vehiculo_id: cliente.vehiculoId,
          duracionHoras: 2 + Math.floor(Math.random() * 3), // 2-4 horas
        });

        reservas.push(reserva);
      } catch (error: any) {
        logStepV3(`Error creando reserva de simulación para plaza ${plaza.id}:`, { 
          etiqueta: 'RESERVA_HELPER', 
          tipo: 'warning' 
        }, error?.response?.body);
      }

      // Pausa entre reservas
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    logStepV3(`📊 Ocupación simulada: ${reservas.length}/${plazas.length} plazas ocupadas`, { 
      etiqueta: 'RESERVA_HELPER' 
    });

    return reservas;
  }

  /**
   * Validar datos de reserva
   */
  static validateReservaData(data: {
    usuario_id: string;
    plaza_id: number;
    vehiculo_id: string;
    fecha_inicio: string | Date;
    fecha_fin: string | Date;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.usuario_id) errors.push('usuario_id es requerido');
    if (!data.plaza_id) errors.push('plaza_id es requerido');
    if (!data.vehiculo_id) errors.push('vehiculo_id es requerido');
    if (!data.fecha_inicio) errors.push('fecha_inicio es requerida');
    if (!data.fecha_fin) errors.push('fecha_fin es requerida');

    if (data.fecha_inicio && data.fecha_fin) {
      const inicio = new Date(data.fecha_inicio);
      const fin = new Date(data.fecha_fin);

      if (isNaN(inicio.getTime())) errors.push('fecha_inicio inválida');
      if (isNaN(fin.getTime())) errors.push('fecha_fin inválida');
      if (fin <= inicio) errors.push('fecha_fin debe ser posterior a fecha_inicio');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generar datos de reserva para testing
   */
  static generateReservaData(
    usuario_id: string,
    plaza_id: number,
    vehiculo_id: string,
    options: {
      horasEnElFuturo?: number;
      duracionHoras?: number;
    } = {}
  ) {
    const horasEnElFuturo = options.horasEnElFuturo || 1;
    const duracionHoras = options.duracionHoras || 2;

    const fechaInicio = new Date();
    fechaInicio.setHours(fechaInicio.getHours() + horasEnElFuturo);

    const fechaFin = new Date(fechaInicio);
    fechaFin.setHours(fechaFin.getHours() + duracionHoras);

    return {
      usuario_id,
      plaza_id,
      vehiculo_id,
      fecha_inicio: fechaInicio.toISOString(),
      fecha_fin: fechaFin.toISOString(),
    };
  }
}
