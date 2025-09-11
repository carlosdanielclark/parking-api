// test/helpers/data-fixtures.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { EstadoPlaza, TipoPlaza } from '../../src/entities/plaza.entity';
import { EstadoReservaDTO } from '../../src/entities/reserva.entity';
import { AuthHelper } from './auth-helper';
import { logStepV3 } from './log-util';

export interface PlazaOptions {
  count?: number;
  prefix?: string;
  tipo?: TipoPlaza;
  estado?: EstadoPlaza;
}

export interface VehiculoOptions {
  placa?: string;
  marca?: string;
  modelo?: string;
  color?: string;
}

export interface ReservaOptions {
  horasEnElFuturo?: number;
  duracionHoras?: number;
  estado?: EstadoReservaDTO;
  fecha_inicio?: string;
  fecha_fin?: string;
}

/**
 * Helper para creación de datos de prueba en tests E2E
 * Facilita la creación de entidades con datos consistentes y realistas
 */
export class DataFixtures {
  private static vehiculoCounter = 0;
  private static testRunId: string;
  private static generatedPlazaNumbers: Set<string> = new Set();

  // EDITADO: mantener contador y set de placas; añadir limpieza específica
  private static plazaCounter = 0;
  private static placaCounter = 0;
  private static generatedPlacas: Set<string> = new Set();

  private createdPlazaIds: Set<number> = new Set();
  private createdVehiculoIds: Set<string> = new Set();
  private createdReservaIds: Set<string> = new Set();
  private adminToken: string = '';
  private request: any;

  constructor(private app: INestApplication) {
    if (!DataFixtures.testRunId) {
      DataFixtures.testRunId = Math.random().toString(36).substring(2, 6);
    }
    this.request = request(this.app.getHttpServer());
  }

  /**
   * Limpia el registro de números de plaza generados y resetea contadores.
   * Útil para asegurar que cada test comience con un estado limpio.
   */
  static clearGeneratedPlazaNumbers(): void {
    // Limpiar sets
    DataFixtures.generatedPlazaNumbers.clear();
    DataFixtures.generatedPlacas.clear();

    // ✅ RESET COMPLETO de contadores para evitar acumulación
    DataFixtures.vehiculoCounter = 0;
    DataFixtures.placaCounter = 0;
    DataFixtures.plazaCounter = 0;

    logStepV3('🧹 Estado estático limpiado completamente', {
      etiqueta: 'CLEAR_STATE',
      tipo: 'info',
    });
  }

  /**
   * NUEVO: Limpia únicamente el Set de placas generadas y resetea el contador de placas.
   * Útil para specs que generan muchas placas sin tocar el estado de plazas.
   */
  static clearGeneratedPlacas(): void {
    DataFixtures.generatedPlacas.clear();
    DataFixtures.placaCounter = 0;
    logStepV3('🧹 generatedPlacas limpiado', { etiqueta: 'DATA_FIXTURES', tipo: 'info' });
  }

  /**
   * Crea múltiples plazas de parking
   */
  async createPlazas(adminToken: string, options: PlazaOptions = {}): Promise<any[]> {
    const {
      count = 5,
      prefix = 'A',
      tipo = TipoPlaza.NORMAL,
      estado = EstadoPlaza.LIBRE,
    } = options;

    const plazas: any[] = [];

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let success = false;
      const maxAttempts = 5;
      let lastError: any = null;

      while (attempts < maxAttempts && !success) {
        try {
          const numeroPlaza = await this.generarNumeroPlazaUnico(prefix);

          // Validación defensiva explícita
          if (typeof numeroPlaza !== 'string') {
            logStepV3(
              `❌ Generador devolvió un valor no string para numero_plaza`,
              { etiqueta: 'PLAZA_CREATION', tipo: 'error' },
              { numeroPlazaTipo: typeof numeroPlaza, numeroPlaza }
            );

            throw new Error('Generación de numero_plaza inválida (no es string)');
          }

          if (numeroPlaza.length > 5) {
            logStepV3(
              `❌ numero_plaza excede 5 caracteres: "${numeroPlaza}" (${numeroPlaza.length})`,
              { etiqueta: 'PLAZA_CREATION', tipo: 'error' }
            );
            throw new Error(`numero_plaza inválido: longitud ${numeroPlaza.length} > 5`);
          }

          logStepV3(`Intento ${attempts + 1}/${maxAttempts}: Creando plaza ${numeroPlaza}`, {
            etiqueta: 'PLAZA_CREATION',
            tipo: 'info',
          });

          const response = await request(this.app.getHttpServer())
            .post('/plazas')
            .set({ Authorization: `Bearer ${adminToken}` })
            .send({
              numero_plaza: numeroPlaza,
              tipo,
              estado,
            })
            .timeout(10000);

          if (response.status === 201) {
            plazas.push(response.body.data);
            success = true;
            logStepV3(`✅ Plaza creada exitosamente: ${numeroPlaza}`, {
              etiqueta: 'PLAZA_CREATION',
              tipo: 'info',
            });
            // this.createdPlazaIds.add(response.body.data.id);
          } else {
            logStepV3(
              `❌ Error inesperado creando plaza: Status ${response.status}`,
              { etiqueta: 'PLAZA_CREATION', tipo: 'error' },
              response.body
            );
            attempts++;
          }
        } catch (error: any) {
          attempts++;
          lastError = error;

          logStepV3(
            `❌ Error en intento ${attempts}/${maxAttempts}: ${error.message}`,
            { etiqueta: 'PLAZA_CREATION', tipo: 'error' },
            error.response?.body || error
          );

          // duplicado
          if (
            error.status === 422 ||
            error.message?.includes('duplicad') ||
            error.message?.includes('already exists') ||
            error.response?.body?.message?.includes('duplicad')
          ) {
            logStepV3(
              `🔄 Plaza duplicada, generando nuevo número... status${error.status}`,
              { etiqueta: 'PLAZA_CREATION', tipo: 'warning' },
              error.message
            );
            await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
            continue;
          }

          // conexión
          if (
            error.message?.includes('ECONNRESET') ||
            error.message?.includes('timeout') ||
            error.code === 'ECONNRESET'
          ) {
            logStepV3(
              `Error de conexión, reintentando...`,
              { etiqueta: 'PLAZA_CREATION', tipo: 'warning' },
              error.message
            );
            await new Promise((resolve) => setTimeout(resolve, 200 * attempts));
            continue;
          }

          await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
        }
      }

      if (!success) {
        logStepV3(
          `💥 No se pudo crear plaza después de ${maxAttempts} intentos`,
          { etiqueta: 'PLAZA_CREATION', tipo: 'error' },
          lastError
        );
        throw new Error(`No se pudo crear plaza después de ${maxAttempts} intentos`);
      }

      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    logStepV3(`🅿Creadas ${plazas.length} plazas de parking`, {
      etiqueta: 'PLAZA_CREATION',
      tipo: 'info',
    });
    return plazas;
  }

  /**
   * Cancela una reserva de manera segura (maneja errores 404)
   */
  async cancelarReserva(adminToken: string, reservaId: string): Promise<void> {
    try {
      await request(this.app.getHttpServer())
        .post(`/reservas/${reservaId}/cancelar`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .timeout(10000);
    } catch (error: any) {
      if (error.status === 404) {
        return;
      }
      throw error;
    }
  }

  // Agregar método de limpieza completa de base de datos
  async cleanupDatabase(adminToken: string): Promise<void> {
    logStepV3('Iniciando limpieza completa de base de datos...', {
      etiqueta: 'DATABASE_CLEANUP',
      tipo: 'info',
    });

    try {
      // 1. Cancelar todas las reservas activas
      const reservasResponse = await request(this.app.getHttpServer())
        .get('/reservas/activas')
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(30000);

      if (reservasResponse.status === 200 && reservasResponse.body.data.length > 0) {
        for (const reserva of reservasResponse.body.data) {
          await this.cancelarReserva(adminToken, reserva.id);
        }
      }

      // 2. Eliminar todos los vehículos de prueba
      const vehiculosResponse = await request(this.app.getHttpServer())
        .get('/vehiculos')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 1000 })
        .timeout(30000);

      if (vehiculosResponse.status === 200 && vehiculosResponse.body.data.length > 0) {
        for (const vehiculo of vehiculosResponse.body.data) {
          if (vehiculo.placa.includes('TEST') || vehiculo.placa.includes('TMP')) {
            await this.safeDeleteEntity('/vehiculos', vehiculo.id, adminToken, 'Vehículo');
          }
        }
      }

      // 3. Eliminar todas las plazas de prueba
      const plazasResponse = await request(this.app.getHttpServer())
        .get('/plazas')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 1000 })
        .timeout(30000);

      if (plazasResponse.status === 200 && plazasResponse.body.data.length > 0) {
        for (const plaza of plazasResponse.body.data) {
          if (plaza.numero_plaza.startsWith('A') || plaza.numero_plaza.startsWith('B')) {
            await this.safeDeleteEntity('/plazas', plaza.id.toString(), adminToken, 'Plaza');
          }
        }
      }

      logStepV3('Limpieza de base de datos completada', {
        etiqueta: 'DATABASE_CLEANUP',
        tipo: 'info',
      });
    } catch (error: any) {
      logStepV3(
        'Error durante limpieza de base de datos:',
        { etiqueta: 'DATABASE_CLEANUP', tipo: 'error' },
        error.message
      );
    }
  }

  /*
   * Función de limpieza completa (cleanupAll)
   */
  async cleanupAll(adminToken: string) {
    try {
      const reservasResponse = await request(this.app.getHttpServer())
        .get('/reservas')
        .set('Authorization', `Bearer ${adminToken}`);

      const todasLasReservas = reservasResponse.body?.data || reservasResponse.body || [];

      if (!Array.isArray(todasLasReservas)) {
        logStepV3(`Respuesta de reservas no es array, omitiendo cleanup de reservas`, {
          etiqueta: 'CLEANUP_ALL',
          tipo: 'warning',
        });
        return;
      }

      for (const reserva of todasLasReservas) {
        try {
          await request(this.app.getHttpServer())
            .post(`/reservas/${reserva.id}/cancelar`)
            .set('Authorization', `Bearer ${adminToken}`);
        } catch (error: any) {
          logStepV3(`Error cancelando reserva ${reserva.id}: ${error.message}`, {
            etiqueta: 'CLEANUP_ALL',
            tipo: 'warning',
          });
        }
      }

      const vehiculosResponse = await request(this.app.getHttpServer())
        .get('/vehiculos')
        .set('Authorization', `Bearer ${adminToken}`);

      const todosLosVehiculos = vehiculosResponse.body?.data || vehiculosResponse.body || [];

      if (Array.isArray(todosLosVehiculos)) {
        for (const vehiculo of todosLosVehiculos) {
          try {
            await request(this.app.getHttpServer())
              .delete(`/vehiculos/${vehiculo.id}`)
              .set('Authorization', `Bearer ${adminToken}`);
          } catch (error: any) {
            logStepV3(`Error eliminando vehículo ${vehiculo.id}: ${error.message}`, {
              etiqueta: 'CLEANUP_ALL',
              tipo: 'warning',
            });
          }
        }
      }

      const plazasResponse = await request(this.app.getHttpServer())
        .get('/plazas')
        .set('Authorization', `Bearer ${adminToken}`);

      const todasLasPlazas = plazasResponse.body?.data || plazasResponse.body || [];

      if (Array.isArray(todasLasPlazas)) {
        for (const plaza of todasLasPlazas) {
          try {
            await request(this.app.getHttpServer())
              .delete(`/plazas/${plaza.id}`)
              .set('Authorization', `Bearer ${adminToken}`);
          } catch (error: any) {
            logStepV3(`Error eliminando plaza ${plaza.id}: ${error.message}`, {
              etiqueta: 'CLEANUP_ALL',
              tipo: 'warning',
            });
          }
        }
      }
    } catch (error: any) {
      logStepV3(`Error durante cleanupAll: ${error.message}`, {
        etiqueta: 'CLEANUP_ALL',
        tipo: 'error',
      });
    }
  }

  /**
   * Limpieza completa y ordenada de datos de test
   * Maneja correctamente las dependencias entre entidades
   */
  async cleanupComplete(adminToken: string) {
    logStepV3('Iniciando limpieza completa ordenada...', {
      etiqueta: 'HELPER',
      tipo: 'info',
    });

    try {
      // 1. Primero cancelar todas las reservas activas
      await this.cleanupReservas(adminToken);

      // 2. Esperar a que se procesen las cancelaciones
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 3. Eliminar vehículos (ahora que no tienen reservas activas)
      await this.cleanupVehiculos(adminToken);

      // 4. Esperar antes de eliminar plazas
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 5. Finalmente eliminar plazas
      await this.cleanupPlazas(adminToken);

      logStepV3('Limpieza completa finalizada exitosamente', {
        etiqueta: 'HELPER',
        tipo: 'info',
      });
    } catch (error: any) {
      logStepV3(`Error durante limpieza completa: ${error.message}`, {
        etiqueta: 'HELPER',
        tipo: 'error',
      });
      await this.emergencyCleanup(adminToken);
    }
  }

  /**
   * Limpieza mejorada de plazas con mejor manejo de errores
   * EDITADO: ahora intenta limpiar reservas de la plaza y reintenta DELETE con backoff.
   */
  async cleanupPlazas(adminToken: string) {
    let deletedCount = 0;
    const plazaIds = Array.from(this.createdPlazaIds);

    for (const plazaId of plazaIds) {
      try {
        const response = await this.request
          .get(`/plazas/${plazaId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        if (response.status === 200) {
          // Intento inicial de eliminación
          const delResp = await this.request
            .delete(`/plazas/${plazaId}`)
            .set('Authorization', `Bearer ${adminToken}`);

          if (delResp.status === 200 || delResp.status === 204) {
            logStepV3(`Plaza ${plazaId} eliminada exitosamente`, { etiqueta: 'Cleanup-Plazas' });
            deletedCount++;
            continue;
          }

          // Si hay reservas activas, intentar limpiar y reintentar con backoff
          if (
            delResp.status === 400 &&
            typeof delResp.body?.message === 'string' &&
            delResp.body.message.toLowerCase().includes('reservas activas')
          ) {
            logStepV3(`Plaza ${plazaId} tiene reservas activas. Intentando limpiar reservas...`, {
              etiqueta: 'Cleanup-Plazas',
              tipo: 'warning',
            });

            // Intentar limpiar reservas
            await this.limpiarReservasDePlaza(adminToken, plazaId);

            // Reintentos con backoff
            const waits = [100, 200, 400];
            let reintentoExitoso = false;
            for (let i = 0; i < waits.length; i++) {
              await new Promise((resolve) => setTimeout(resolve, waits[i]));
              const del2 = await this.request
                .delete(`/plazas/${plazaId}`)
                .set('Authorization', `Bearer ${adminToken}`);
              if (del2.status === 200 || del2.status === 204) {
                logStepV3(`Plaza ${plazaId} eliminada después de limpieza`, {
                  etiqueta: 'Cleanup-Plazas',
                  tipo: 'info',
                });
                deletedCount++;
                reintentoExitoso = true;
                break;
              }
            }

            if (!reintentoExitoso) {
              logStepV3(`No se pudo eliminar plaza ${plazaId} luego de reintentos`, {
                etiqueta: 'Cleanup-Plazas',
                tipo: 'warning',
              });
            }
          } else {
            logStepV3(
              `Respuesta inesperada eliminando plaza ${plazaId}: status ${delResp.status}`,
              { etiqueta: 'Cleanup-Plazas', tipo: 'warning' }
            );
          }
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          logStepV3(`Plaza ${plazaId} no existe, omitiendo eliminación`, {
            etiqueta: 'Cleanup-Plazas',
          });
        } else if (
          error.response?.status === 400 &&
          error.response?.body?.message?.includes('reservas activas')
        ) {
          logStepV3(`Plaza ${plazaId} tiene reservas activas, omitiendo eliminación`, {
            etiqueta: 'Cleanup-Plazas',
            tipo: 'warning',
          });
        } else {
          logStepV3(
            `Error al eliminar plaza ${plazaId}: ${error.response?.body?.message || error.message}`,
            { etiqueta: 'Cleanup-Plazas', tipo: 'warning' }
          );
        }
      }
    }

    logStepV3(
      `Eliminadas ${deletedCount} de ${plazaIds.length} plazas de prueba`,
      { etiqueta: 'Cleanup-Plazas', tipo: 'info' }
    );
    this.createdPlazaIds.clear();
  }

  /**
   * Limpieza mejorada de reserva con mejor manejo de errores
   */
  async cleanupReservas(adminToken: string) {
    for (const reservaId of this.createdReservaIds) {
      try {
        const response = await this.request
          .get(`/reservas/${reservaId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        if (response.status === 200) {
          await this.request
            .post(`/reservas/${reservaId}/cancelar`)
            .set('Authorization', `Bearer ${adminToken}`);
          logStepV3(`Reserva ${reservaId} cancelada exitosamente`, {
            etiqueta: 'Cleanup-Reserva',
          });
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          logStepV3(`Reserva ${reservaId} no existe, omitiendo cancelación`, {
            etiqueta: 'Cleanup-Reserva',
          });
        } else {
          logStepV3(`Error al cancelar reserva ${reservaId}: ${error.message}`, {
            etiqueta: 'CLeanup-Reserva',
          });
        }
      }
    }
    this.createdReservaIds.clear();
  }

  /**
   * Limpieza mejorada de vehiculo con mejor manejo de errores
   * EDITADO: ahora utiliza safeDeleteVehiculo() que cancela reservas activas y reintenta DELETE con backoff.
   */
  async cleanupVehiculos(adminToken: string) {
    let deletedCount = 0;
    const vehiculoIds = Array.from(this.createdVehiculoIds);

    for (const vehiculoId of vehiculoIds) {
      try {
        const response = await this.request
          .get(`/vehiculos/${vehiculoId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        if (response.status === 200) {
          const success = await this.safeDeleteVehiculo(adminToken, vehiculoId);
          if (success) {
            deletedCount++;
          } else {
            logStepV3(`No se pudo eliminar vehículo ${vehiculoId} tras reintentos`, {
              etiqueta: 'Cleanup-Vehiculos',
              tipo: 'warning',
            });
          }
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          logStepV3(`Vehículo ${vehiculoId} no existe, omitiendo eliminación`, {
            etiqueta: 'Cleanup-Vehiculos',
          });
        } else {
          logStepV3(`Error verificando vehículo ${vehiculoId}: ${error.message}`, {
            etiqueta: 'Cleanup-Vehiculos',
            tipo: 'warning',
          });
        }
      }
    }

    logStepV3(
      `Eliminados ${deletedCount} de ${vehiculoIds.length} vehículos de prueba`,
      {
        etiqueta: 'CLeanup-Vehiculos',
        tipo: 'info',
      }
    );
    this.createdVehiculoIds.clear();
  }

  /**
   * NUEVO: Método seguro para eliminar un vehículo. Maneja 400 por reservas activas,
   * cancela reservas activas y reintenta DELETE con backoff (100,200,400 ms).
   */
  private async safeDeleteVehiculo(adminToken: string, vehiculoId: string): Promise<boolean> {
    try {
      // Intento inicial de eliminación
      const initialDel = await this.request
        .delete(`/vehiculos/${vehiculoId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (initialDel.status === 200 || initialDel.status === 204) {
        logStepV3(`Vehículo ${vehiculoId} eliminado (intento inicial)`, {
          etiqueta: 'HELPER',
          tipo: 'info',
        });
        return true;
      }

      // Si backend responde 400 con mensaje de reservas activas, intentar cancelar y reintentar
      if (
        initialDel.status === 400 &&
        typeof initialDel.body?.message === 'string' &&
        initialDel.body.message.toLowerCase().includes('reservas activas')
      ) {
        logStepV3(`Vehículo ${vehiculoId} tiene reservas activas. Obteniendo reservas...`, {
          etiqueta: 'HELPER',
          tipo: 'warning',
        });

        // Obtener reservas asociadas al vehículo
        const reservasResp = await this.request
          .get(`/reservas`)
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ vehiculo_id: vehiculoId });

        if (reservasResp.status === 200 && Array.isArray(reservasResp.body?.data)) {
          const activas = reservasResp.body.data.filter(
            (r: any) => r.vehiculo?.id === vehiculoId && r.estado === 'activa'
          );

          for (const r of activas) {
            try {
              await this.request
                .post(`/reservas/${r.id}/cancelar`)
                .set('Authorization', `Bearer ${adminToken}`)
                .timeout(5000);
              logStepV3(`Reserva ${r.id} cancelada para permitir delete de vehículo ${vehiculoId}`, {
                etiqueta: 'HELPER',
                tipo: 'info',
              });
            } catch (err: any) {
              logStepV3(`Error cancelando reserva ${r.id}: ${err.message}`, {
                etiqueta: 'HELPER',
                tipo: 'warning',
              });
            }
          }
        }

        // Reintentos con backoff
        const waits = [100, 200, 400];
        for (let i = 0; i < waits.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, waits[i]));
          const del2 = await this.request
            .delete(`/vehiculos/${vehiculoId}`)
            .set('Authorization', `Bearer ${adminToken}`);
          if (del2.status === 200 || del2.status === 204) {
            logStepV3(`Vehículo ${vehiculoId} eliminado tras cancelar reservas (retry)`, {
              etiqueta: 'HELPER',
              tipo: 'info',
            });
            return true;
          }
        }

        logStepV3(`No se pudo eliminar vehículo ${vehiculoId} tras reintentos`, {
          etiqueta: 'HELPER',
          tipo: 'warning',
        });
        return false;
      }

      // Otros códigos inesperados
      logStepV3(
        `Intento eliminar vehículo ${vehiculoId} devolvió status ${initialDel.status}`,
        { etiqueta: 'HELPER', tipo: 'warning' }
      );
      return false;
    } catch (error: any) {
      // Manejo de errores de red
      if (error.message?.includes('ECONNRESET')) {
        logStepV3(`ECONNRESET al eliminar vehículo ${vehiculoId}: ${error.message}`, {
          etiqueta: 'HELPER',
          tipo: 'warning',
        });
      } else {
        logStepV3(`Error eliminando vehículo ${vehiculoId}: ${error.message}`, {
          etiqueta: 'HELPER',
          tipo: 'warning',
        });
      }
      return false;
    }
  }

  /**
   * NUEVO: Genera un candidato de placa con formato ABC123
   * Longitud <= 10, caracteres alfanuméricos.
   */
  private generateRandomPlacaCandidate(): string {
    const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const letters = `${randLetter()}${randLetter()}${randLetter()}`;
    const digits = Math.floor(100 + Math.random() * 900).toString();
    return `${letters}${digits}`; // p.e. ABC123
  }

  /**
   * NUEVO: Genera una placa válida única con límite de intentos.
   * Usa un Set estático para evitar colisiones entre tests.
   */
  public generateValidPlaca(): string {
    const MAX_ATTEMPTS = 50;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = this.generateRandomPlacaCandidate();
      if (
        candidate.length <= 10 &&
        /^[A-Z0-9]+$/.test(candidate) &&
        !DataFixtures.generatedPlacas.has(candidate)
      ) {
        DataFixtures.generatedPlacas.add(candidate);
        return candidate;
      }
    }
    const errMsg = `No se pudo generar placa única tras ${MAX_ATTEMPTS} intentos`;
    logStepV3(errMsg, { etiqueta: 'DATA_FIXTURES', tipo: 'error' });
    throw new Error(errMsg);
  }

  /**
   * Crea un vehículo para un usuario
   * EDITADO: por defecto usa generateValidPlaca() para minimizar colisiones;
   * sigue permitiendo override y mantiene validaciones.
   */
  async createVehiculo(
    clienteId: string,
    clienteToken: string,
    options: VehiculoOptions = {}
  ): Promise<any> {
    const placaGenerada = options.placa ?? this.generateValidPlaca();

    const vehiculoData = {
      placa: placaGenerada,
      marca: options.marca || this.getRandomMarca(),
      modelo: options.modelo || this.getRandomModelo(),
      color: options.color || this.getRandomColor(),
      usuario_id: clienteId,
    };

    // ✅ VALIDACIÓN MEJORADA con más detalles
    if (!vehiculoData.placa) {
      throw new Error('Placa es requerida para crear vehículo');
    }

    if (vehiculoData.placa.length > 10) {
      logStepV3(
        `❌ Placa excede límite: "${vehiculoData.placa}" (${vehiculoData.placa.length} chars)`,
        { etiqueta: 'VEHICULO_VALIDATION', tipo: 'error' }
      );
      throw new Error(
        `Placa inválida: "${vehiculoData.placa}" excede 10 caracteres (actual: ${vehiculoData.placa.length})`
      );
    }

    // ✅ VALIDACIÓN DE FORMATO: solo alfanuméricos
    if (!/^[A-Z0-9]+$/.test(vehiculoData.placa)) {
      throw new Error(`Placa inválida: "${vehiculoData.placa}" contiene caracteres no válidos`);
    }

    if (!clienteId || !clienteToken) {
      throw new Error('clienteId y clienteToken son requeridos');
    }

    logStepV3(
      `🚗 Creando vehículo con placa: "${vehiculoData.placa}" (${vehiculoData.placa.length} chars)`,
      { etiqueta: 'VEHICULO_CREATE', tipo: 'info' }
    );

    try {
      const response = await request(this.app.getHttpServer())
        .post('/vehiculos')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send(vehiculoData)
        .timeout(15000)
        .expect(201);

      // Registrar para limpieza
      if (response.body.data?.id) {
        this.createdVehiculoIds.add(response.body.data.id);
      }

      logStepV3(
        `✅ Vehículo creado: ${vehiculoData.placa} (${vehiculoData.marca} ${vehiculoData.modelo})`,
        { etiqueta: 'HELPER', tipo: 'info' }
      );

      return response.body.data;
    } catch (error: any) {
      logStepV3(
        `❌ Error creando vehículo con placa ${vehiculoData.placa}:`,
        { etiqueta: 'HELPER', tipo: 'error' },
        {
          status: error.status,
          message: error.message,
          body: error.response?.body,
          vehiculoData,
        }
      );
      throw error;
    }
  }

  /**
   * Crea múltiples vehículos para un usuario
   */
  async createMultipleVehiculos(
    clienteId: string,
    clienteToken: string,
    count: number = 3
  ): Promise<any[]> {
    const vehiculos: any[] = [];

    for (let i = 0; i < count; i++) {
      const vehiculo = await this.createVehiculo(clienteId, clienteToken, {
        placa: this.generateUniquePlaca('MLT'),
      });
      vehiculos.push(vehiculo);
    }

    return vehiculos;
  }

  /**
   * Crea una reserva de plaza con validación previa
   * Mejorado para manejar errores 422 y validaciones
   */
  async createReserva(
    clienteToken: string,
    reservaData: {
      usuario_id: string;
      plaza: any; // plaza completa (con id y numero_plaza)
      vehiculo_id: string;
      fecha_inicio: Date;
      fecha_fin: Date;
    }
  ): Promise<any> {
    const response = await request(this.app.getHttpServer())
      .post('/reservas')
      .set({ Authorization: `Bearer ${clienteToken}` })
      .send({
        usuario_id: reservaData.usuario_id,
        plaza_id: reservaData.plaza.id, // 👈 usar id real, no numero_plaza
        vehiculo_id: reservaData.vehiculo_id,
        fecha_inicio: reservaData.fecha_inicio,
        fecha_fin: reservaData.fecha_fin,
      })
      .expect(201);

    logStepV3(
      `Reserva creada: plaza ${reservaData.plaza.numero_plaza} (id=${reservaData.plaza.id})`,
      { tipo: 'info' }
    );

    return response.body.data;
  }

  /**
   * Crea múltiples reservas para un usuario
   */
  async createMultipleReservas(
    userId: string,
    vehiculoId: string,
    token: string,
    plazas: any[],
    count: number = 3
  ): Promise<any[]> {
    const reservas: any[] = [];

    for (let i = 0; i < Math.min(count, plazas.length); i++) {
      const fechaInicio = new Date();
      fechaInicio.setHours(fechaInicio.getHours() + (i + 1) * 2); // Espaciar las reservas

      const fechaFin = new Date(fechaInicio);
      fechaFin.setHours(fechaFin.getHours() + 1 + (i % 3)); // Duración variable

      const reserva = await this.createReserva(token, {
        usuario_id: userId,
        plaza: plazas[i], // pasar el objeto completo
        vehiculo_id: vehiculoId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      reservas.push(reserva);

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return reservas;
  }

  /**
   * Crea reservas en el pasado para testing de historial
   */
  async createPastReservas(
    userId: string,
    vehiculoId: string,
    token: string,
    plazas: any[],
    days: number = 7
  ): Promise<any[]> {
    const reservas: any[] = [];

    for (let i = 0; i < Math.min(days, plazas.length); i++) {
      const diasAtras = days - i;
      const ahora = new Date();
      const inicio = new Date(
        ahora.getTime() - diasAtras * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000
      );
      const fin = new Date(inicio.getTime() + 60 * 60 * 1000); // 1 hora de duración

      const reservaData = {
        usuario_id: userId,
        plaza_id: plazas[i].id,
        vehiculo_id: vehiculoId,
        fecha_inicio: inicio.toISOString(),
        fecha_fin: fin.toISOString(),
      };

      const response = await request(this.app.getHttpServer())
        .post('/reservas')
        .set('Authorization', `Bearer ${token}`)
        .send(reservaData);

      if (response.status === 201) {
        reservas.push(response.body.data);
      }
    }

    return reservas;
  }

  /**
   * Simula ocupación del parking con múltiples reservas
   */
  async simulateOccupancy(
    clientesData: Array<{ userId: string; vehiculoId: string; token: string }>,
    plazas: any[],
    occupancyPercentage: number = 0.7
  ): Promise<any[]> {
    const plazasAOcupar = Math.floor(plazas.length * occupancyPercentage);
    const reservas: any[] = [];

    for (let i = 0; i < plazasAOcupar && i < clientesData.length; i++) {
      const cliente = clientesData[i % clientesData.length];

      const fechaInicio = new Date();
      fechaInicio.setMinutes(fechaInicio.getMinutes() + 0.1 * 60);

      const duracionHoras = 2 + Math.floor(Math.random() * 3);
      const fechaFin = new Date(fechaInicio);
      fechaFin.setHours(fechaFin.getHours() + duracionHoras);

      const reserva = await this.createReserva(cliente.token, {
        usuario_id: cliente.userId,
        plaza: plazas[i],
        vehiculo_id: cliente.vehiculoId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      reservas.push(reserva);
    }

    logStepV3(
      `📊 Simulada ocupación del ${(occupancyPercentage * 100).toFixed(0)}%: ${reservas.length}/${plazas.length} plazas ocupadas`
    );
    return reservas;
  }

  /**
   * Crea escenario completo de testing con múltiples entidades
   */
  async createCompleteScenario(adminToken: string): Promise<{
    plazas: any[];
    clientes: Array<{
      userId: string;
      vehiculoId: string;
      token: string;
      user: any;
      vehiculo: any;
    }>;
    reservasActivas: any[];
    reservasPasadas: any[];
  }> {
    // Crear plazas
    const plazas = await this.createPlazas(adminToken, { count: 10 });

    // Crear múltiples clientes con vehículos
    const clientes: any[] = [];
    for (let i = 0; i < 5; i++) {
      const clienteResponse = await request(this.app.getHttpServer())
        .post('/auth/register')
        .send({
          nombre: `Cliente Test ${i + 1}`,
          email: `cliente.test${i + 1}@example.com`,
          password: 'cliente123456',
          telefono: `+123456789${i}`,
        })
        .expect(201);

      const cliente = clienteResponse.body.data;
      const vehiculo = await this.createVehiculo(cliente.user.id, cliente.access_token, {});

      clientes.push({
        userId: cliente.user.id,
        vehiculoId: vehiculo.id,
        token: cliente.access_token,
        user: cliente.user,
        vehiculo,
      });
    }

    // Crear reservas activas
    const reservasActivas: any[] = [];
    for (let i = 0; i < 3; i++) {
      const fechaInicio = new Date();
      fechaInicio.setMinutes(fechaInicio.getMinutes() + i * 10);

      const duracionHoras = 2;
      const fechaFin = new Date(fechaInicio);
      fechaFin.setHours(fechaFin.getHours() + duracionHoras);

      const reserva = await this.createReserva(clientes[i].token, {
        usuario_id: clientes[i].userId,
        plaza: plazas[i],
        vehiculo_id: clientes[i].vehiculoId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      reservasActivas.push(reserva);
    }

    // Crear reservas pasadas
    const reservasPasadas = await this.createPastReservas(
      clientes[0].userId,
      clientes[0].vehiculoId,
      clientes[0].token,
      plazas.slice(5, 8)
    );

    return {
      plazas,
      clientes,
      reservasActivas,
      reservasPasadas,
    };
  }

  /**
   * Genera una fecha futura
   */
  generateFutureDate(hoursFromNow: number): string {
    const date = new Date();
    date.setHours(date.getHours() + hoursFromNow);
    return date.toISOString();
  }

  /**
   * Genera una fecha pasada
   */
  generatePastDate(hoursAgo: number): string {
    const date = new Date();
    date.setHours(date.getHours() - hoursAgo);
    return date.toISOString();
  }

  /**
   * Genera una placa única para vehículos de prueba
   * Evita duplicados usando un Set y contadores incrementales
   */
  generateUniquePlaca(prefix: string = 'TMP'): string {
    let intentos = 0;
    const maxIntentos = 15;

    while (intentos < maxIntentos) {
      DataFixtures.placaCounter++;

      const shortPrefix = prefix.substring(0, 2).toUpperCase();
      const counter = (DataFixtures.placaCounter % 100).toString().padStart(2, '0');
      const timestamp = Date.now().toString(36).slice(-3).toUpperCase();
      const random = Math.random().toString(36).substring(2, 5).toUpperCase();

      const placa = `${shortPrefix}${counter}${timestamp}${random}`;

      if (placa.length > 10) {
        logStepV3(`⚠️ Placa generada excede 10 chars: ${placa} (${placa.length})`, {
          etiqueta: 'PLACA_GEN',
          tipo: 'warning',
        });
        intentos++;
        continue;
      }

      if (!DataFixtures.generatedPlacas.has(placa)) {
        DataFixtures.generatedPlacas.add(placa);

        logStepV3(`✅ Placa generada: ${placa} (${placa.length} chars)`, {
          etiqueta: 'PLACA_GEN',
          tipo: 'info',
        });

        return placa;
      }

      intentos++;
    }

    const fallbackPlaca = `${prefix.substring(0, 2)}${Date.now().toString().slice(-6)}`.substring(
      0,
      10
    );

    logStepV3(`⚡ Usando placa fallback: ${fallbackPlaca}`, {
      etiqueta: 'PLACA_GEN',
      tipo: 'warning',
    });

    return fallbackPlaca;
  }

  async waitForPlazaState(
    app: INestApplication,
    plazaId: number,
    estadoEsperado: EstadoPlaza,
    authHelper: AuthHelper,
    usuarios: any,
    intentosMax = 10,
    delayMs = 100
  ) {
    let intentos = 0;
    while (intentos < intentosMax) {
      const response = await request(app.getHttpServer())
        .get(`/plazas/${plazaId}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token));
      if (response.body.data.estado === estadoEsperado) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      intentos++;
    }
    throw new Error(
      `La plaza no alcanzó el estado ${estadoEsperado} después de ${intentosMax} intentos`
    );
  }

  // Helpers para datos aleatorios
  private getRandomMarca(): string {
    const marcas = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes', 'Audi'];
    return marcas[Math.floor(Math.random() * marcas.length)];
  }

  private getRandomModelo(): string {
    const modelos = ['Sedan', 'Corolla', 'Civic', 'Focus', 'Aveo', 'X3', 'C-Class', 'A4'];
    return modelos[Math.floor(Math.random() * modelos.length)];
  }

  private getRandomColor(): string {
    const colores = ['Blanco', 'Negro', 'Gris', 'Rojo', 'Azul', 'Plata', 'Verde'];
    return colores[Math.floor(Math.random() * colores.length)];
  }

  /**
   * Generador de numero de plaza
   */
  private async generarNumeroPlazaUnico(prefix: string): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const timestamp = Date.now().toString().slice(-4);
      const random = Math.floor(Math.random() * 99)
        .toString()
        .padStart(2, '0');

      const numeroPlaza = `${prefix}${timestamp.slice(-3)}${random}`.substring(0, 5);

      if (!DataFixtures.generatedPlazaNumbers.has(numeroPlaza)) {
        DataFixtures.generatedPlazaNumbers.add(numeroPlaza);
        return numeroPlaza;
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const fallback = `${prefix}${Math.random().toString(36).substring(2, 4)}`.substring(0, 5);
    return String(fallback).substring(0, 5);
  }

  // Verificar existencia antes de eliminar
  private async safeDeleteEntity(
    endpoint: string,
    id: string,
    adminToken: string,
    entityName: string
  ): Promise<boolean> {
    try {
      const getResponse = await request(this.app.getHttpServer())
        .get(`${endpoint}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(5000)
        .catch(() => ({ status: 404 }));

      if (getResponse.status !== 200) {
        logStepV3(`${entityName} ${id} no existe, omitiendo eliminación`, {
          etiqueta: 'HELPER',
          tipo: 'info',
        });
        return false;
      }

      const deleteResponse = await request(this.app.getHttpServer())
        .delete(`${endpoint}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(10000);

      if (deleteResponse.status === 200 || deleteResponse.status === 204) {
        logStepV3(`${entityName} ${id} eliminado`, { etiqueta: 'HELPER' });
        return true;
      }

      // Si el delete devuelve 400 por reservas activas, devolver false para que quien llame gestione la limpieza.
      if (
        deleteResponse.status === 400 &&
        typeof deleteResponse.body?.message === 'string' &&
        deleteResponse.body.message.toLowerCase().includes('reservas activas')
      ) {
        logStepV3(
          `${entityName} ${id} no eliminado por reservas activas. Devolver control al llamador.`,
          { etiqueta: 'HELPER', tipo: 'warning' }
        );
        return false;
      }

      return false;
    } catch (error: any) {
      const errorMessage = error.message || '';
      if (!errorMessage.includes('404') && !errorMessage.includes('not found')) {
        logStepV3(
          `Error eliminando ${entityName} ${id}:`,
          { etiqueta: 'HELPER', tipo: 'warning' },
          errorMessage
        );
      }
      return false;
    }
  }

  /**
   * Elimina todas las reservas asociadas a una plaza, independientemente de su estado.
   * Si el backend prohíbe el hard delete de reservas, intenta primero cancelar las activas
   * y luego intenta eliminar la plaza, logueando si persiste alguna relación.
   */
  private async limpiarReservasDePlaza(adminToken: string, plazaId: number): Promise<void> {
    try {
      const reservasResponse = await request(this.app.getHttpServer())
        .get(`/reservas?plaza_id=${plazaId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(5000);

      if (reservasResponse.status === 200 && reservasResponse.body.data.length > 0) {
        for (const reserva of reservasResponse.body.data) {
          try {
            if (reserva.estado === 'activa') {
              await request(this.app.getHttpServer())
                .post(`/reservas/${reserva.id}/cancelar`)
                .set('Authorization', `Bearer ${adminToken}`)
                .timeout(5000);
            }
          } catch (error: any) {
            logStepV3(`Ignorar errores de cancelación:`, { etiqueta: 'HELPER', tipo: 'error' }, error.message);
          }
        }
      }
    } catch (error: any) {
      logStepV3(
        `Error al limpiar reservas para plaza ${plazaId}:`,
        { etiqueta: 'HELPER', tipo: 'warning' },
        error.message
      );
    }
  }

  /**
   * ✅ NUEVO: Método de limpieza de emergencia
   */
  private async emergencyCleanup(adminToken: string) {
    logStepV3('Iniciando limpieza de emergencia...', {
      etiqueta: 'EMERGENCY',
      tipo: 'warning',
    });

    this.createdReservaIds.clear();
    this.createdVehiculoIds.clear();
    this.createdPlazaIds.clear();

    DataFixtures.generatedPlazaNumbers.clear();
    DataFixtures.generatedPlacas.clear();

    logStepV3('Limpieza de emergencia completada', {
      etiqueta: 'EMERGENCY',
      tipo: 'info',
    });
  }
}
