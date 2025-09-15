import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { EstadoPlaza, TipoPlaza } from '../../../src/entities/plaza.entity';
import { EstadoReservaDTO } from '../../../src/entities/reserva.entity';
import { logStepV3 } from '../log/log-util';
import { UniquenessUtil } from '../uniqueness/uniqueness-util';
import { HttpClient } from '../http/http-client';
import { DataGenerator } from './data-generator';

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
 * REFACTORIZADO: Sistema mejorado con reintentos y generación única robusta
 */
export class DataFixtures {

  // OBSOLETO: Sets estáticos, mantener por compatibilidad
  private static testRunId: string;
  private static generatedPlazaNumbers: Set<string> = new Set();
  private static generatedPlacas: Set<string> = new Set();

  private createdPlazaIds: Set<number> = new Set();
  private createdVehiculoIds: Set<string> = new Set();
  private createdReservaIds: Set<string> = new Set();
  private httpClient: HttpClient;

  constructor(private app: INestApplication) {
    if (!DataFixtures.testRunId) {
      DataFixtures.testRunId = Math.random().toString(36).substring(2, 6);
    }
    this.httpClient = new HttpClient(app);
  }

  /**
   * Crea múltiples plazas de parking con garantía de unicidad
   * Utiliza DataGenerator.generateUniquePlazaId() para IDs únicos
   */
  async createPlazas(adminToken: string, options: PlazaOptions = {}): Promise<any[]> {
    const {
      count = 5,
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
          // Usar DataGenerator para garantizar unicidad
          const numeroPlaza = DataGenerator.generateUniquePlazaId();

          // Validación defensiva explícita
          if (typeof numeroPlaza !== 'string') {
            throw new Error('Generación de numero_plaza inválida (no es string)');
          }
          
          if (numeroPlaza.length > 5) {
            throw new Error(`numero_plaza inválido: longitud ${numeroPlaza.length} > 5`);
          }

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
          } else {
            attempts++;
          }
        } catch (error: any) {
          attempts++;
          lastError = error;

          // duplicado
          if (
            error.status === 422 ||
            error.message?.includes('duplicad') ||
            error.message?.includes('already exists') ||
            error.response?.body?.message?.includes('duplicad')
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
            continue;
          }

          // conexión
          if (
            error.message?.includes('ECONNRESET') ||
            error.message?.includes('timeout') ||
            error.code === 'ECONNRESET'
          ) {
            await new Promise((resolve) => setTimeout(resolve, 500 * attempts)); // Aumentar delay
            continue;
          }

          await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
        }
      }

      if (!success) {
        throw new Error(`No se pudo crear plaza después de ${maxAttempts} intentos`);
      }

      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    return plazas;
  }






  /**
   * Crea un vehículo para un usuario
   * Utiliza DataGenerator.generateUniqueVehiclePlate() para placas únicas
   */
  async createVehiculo(
    clienteId: string,
    clienteToken: string,
    options: VehiculoOptions = {}
  ): Promise<any> {
    const placaGenerada = options.placa ?? DataGenerator.generateUniqueVehiclePlate();

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
   * REFACTORIZADO: Crea una reserva con validación mejorada
   */
  createReserva = async (
    clienteToken: string,
    reservaData: {
      usuario_id: string;
      plaza: any;
      vehiculo_id: string;
      fecha_inicio: Date;
      fecha_fin: Date;
    }
  ): Promise<any> => {
    const plazaSrc = reservaData.plaza;
    const plazaObj = Array.isArray(plazaSrc) ? plazaSrc : plazaSrc;
    const plaza_id = typeof plazaObj === 'number' ? plazaObj : plazaObj?.id;

    if (!plaza_id) {
      throw new Error('plaza_id inválido en DataFixtures.createReserva');
    }
    const payload = {
      usuario_id: reservaData.usuario_id,
      plaza_id, // usar id real, no numero_plaza
      vehiculo_id: reservaData.vehiculo_id,
      fecha_inicio: reservaData.fecha_inicio,
      fecha_fin: reservaData.fecha_fin,
    };

    const response = await this.httpClient.post('/reservas', payload, {
      Authorization: `Bearer ${clienteToken}`
    }, 201);

    // Registrar para limpieza
    if (response.body.data?.id) {
      this.createdReservaIds.add(response.body.data.id);
    }

    return response.body.data;
  }

  /**
   * NUEVO: Crear múltiples vehículos para un usuario
   */
  async createMultipleVehiculos(
    clienteId: string,
    clienteToken: string,
    count: number
  ): Promise<any[]> {
    const vehiculos: any[] = [];

    for (let i = 0; i < count; i++) {
      const vehiculo = await this.createVehiculo(clienteId, clienteToken, {});
      vehiculos.push(vehiculo);
      
      // Pausa pequeña entre creaciones
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return vehiculos;
  }

  /**
   * NUEVO: Limpieza completa y ordenada de todos los datos de test
   */
  async cleanupAll(adminToken: string): Promise<void> {
    try {
      // 1. Primero cancelar todas las reservas activas
      await this.cleanupReservas(adminToken);

      // 2. Esperar a que se procesen las cancelaciones
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3. Eliminar vehículos (ahora que no tienen reservas activas)
      await this.cleanupVehiculos(adminToken);

      // 4. Esperar antes de eliminar plazas
      await new Promise(resolve => setTimeout(resolve, 500));

      // 5. Finalmente eliminar plazas
      await this.cleanupPlazas(adminToken);

      logStepV3('✅ Limpieza completa finalizada exitosamente', {
        etiqueta: 'CLEANUP',
        tipo: 'info'
      });
    } catch (error: any) {
      logStepV3(`❌ Error durante limpieza completa: ${error.message}`, {
        etiqueta: 'CLEANUP',
        tipo: 'error'
      });
      await this.emergencyCleanup(adminToken);
    }
  }

  /**
   * Limpieza completa y ordenada de datos de test
   * Maneja correctamente las dependencias entre entidades
   * Ahora incluye limpieza de estado estático
   */
  async cleanupComplete(adminToken: string) {
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

      // 6. Limpiar estado estático
      DataGenerator.clearStaticState();

    } catch (error: any) {
      logStepV3(`Error durante limpieza completa: ${error.message}`, {
        etiqueta: 'HELPER',
        tipo: 'error',
      });
      await this.emergencyCleanup(adminToken);
    }
  }
  
  /**
   * REFACTORIZADO: Limpieza mejorada de plazas con manejo de dependencias
   */
  private async cleanupPlazas(adminToken: string): Promise<void> {
    let deletedCount = 0;
    const plazaIds = Array.from(this.createdPlazaIds);

    for (const plazaId of plazaIds) {
      try {
        const response = await this.httpClient.get(`/plazas/${plazaId}`, {
          Authorization: `Bearer ${adminToken}`
        });

        if (response.status === 200) {
          try {
            await this.httpClient.del(`/plazas/${plazaId}`, {
              Authorization: `Bearer ${adminToken}`
            }, 200);
            
            deletedCount++;
          } catch (delError: any) {
            if (delError.status === 400 && 
                typeof delError.response?.body?.message === 'string' && 
                delError.response.body.message.toLowerCase().includes('reservas activas')) {
              
              logStepV3(`⚠️ Plaza ${plazaId} tiene reservas activas. Intentando limpiar...`, {
                etiqueta: 'CLEANUP_PLAZAS',
                tipo: 'warning',
              });

              await this.limpiarReservasDePlaza(adminToken, plazaId);

              // Reintentos con backoff
              const waits = [100, 200, 400];
              let success = false;
              
              for (const wait of waits) {
                await new Promise(resolve => setTimeout(resolve, wait));
                try {
                  await this.httpClient.del(`/plazas/${plazaId}`, {
                    Authorization: `Bearer ${adminToken}`
                  }, 200);
                  
                  deletedCount++;
                  success = true;
                  break;
                } catch {
                  continue;
                }
              }

              if (!success) {
                logStepV3(`⚠️ No se pudo eliminar plaza ${plazaId} tras reintentos`, {
                  etiqueta: 'CLEANUP_PLAZAS',
                  tipo: 'warning',
                });
              }
            }
          }
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          logStepV3(`Plaza ${plazaId} no existe, omitiendo eliminación`, {
            etiqueta: 'CLEANUP_PLAZAS',
            tipo: 'info'
          });
        } else {
          logStepV3(
            `⚠️ Error al eliminar plaza ${plazaId}: ${error.response?.body?.message || error.message}`,
            { etiqueta: 'CLEANUP_PLAZAS', tipo: 'warning' }
          );
        }
      }
    }

    this.createdPlazaIds.clear();
  }

  /**
   * NUEVO: Limpieza específica de reservas
   */
  private async cleanupReservas(adminToken: string): Promise<void> {
    let cancelledCount = 0;
    const reservaIds = Array.from(this.createdReservaIds);

    for (const reservaId of reservaIds) {
      try {
        await this.cancelarReserva(adminToken, reservaId);
        cancelledCount++;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          logStepV3(`⚠️ Error al cancelar reserva ${reservaId}: ${error.message}`, {
            etiqueta: 'CLEANUP_RESERVAS',
            tipo: 'warning'
          });
        }
      }
    }

    this.createdReservaIds.clear();
  }

  /**
   * NUEVO: Limpieza específica de vehículos
   */
  private async cleanupVehiculos(adminToken: string): Promise<void> {
    let deletedCount = 0;
    const vehiculoIds = Array.from(this.createdVehiculoIds);

    for (const vehiculoId of vehiculoIds) {
      try {
        await this.httpClient.del(`/vehiculos/${vehiculoId}`, {
          Authorization: `Bearer ${adminToken}`
        }, 200);
        deletedCount++;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          logStepV3(`⚠️ Error eliminando vehículo ${vehiculoId}: ${error.message}`, {
            etiqueta: 'CLEANUP_VEHICULOS',
            tipo: 'warning'
          });
        }
      }
    }

    this.createdVehiculoIds.clear();
  }

  /**
   * NUEVO: Cancelación segura de reservas
   */
  private async cancelarReserva(adminToken: string, reservaId: string): Promise<void> {
    try {
      await request(this.app.getHttpServer())
        .post(`/reservas/${reservaId}/cancelar`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .timeout(10000);
      
      logStepV3(`🛑 Reserva cancelada: ${reservaId}`, {
        etiqueta: 'RESERVA_CANCEL',
        tipo: 'info'
      });
    } catch (error: any) {
      if (error.status === 404) {
        logStepV3(`Reserva no existe: ${reservaId} (ignorar)`, {
          etiqueta: 'RESERVA_CANCEL',
          tipo: 'warning'
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Elimina todas las reservas asociadas a una plaza, independientemente de su estado.
   * Mejorado con mayor timeout y manejo de errores
   */
  private async limpiarReservasDePlaza(adminToken: string, plazaId: number): Promise<void> {
    try {
      const reservasResponse = await request(this.app.getHttpServer())
        .get(`/reservas?plaza_id=${plazaId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(15000); // Aumentar timeout

      if (reservasResponse.status === 200 && reservasResponse.body.data.length > 0) {
        for (const reserva of reservasResponse.body.data) {
          try {
            // Cancelar reserva independientemente de su estado
            await request(this.app.getHttpServer())
              .post(`/reservas/${reserva.id}/cancelar`)
              .set('Authorization', `Bearer ${adminToken}`)
              .timeout(10000); // Aumentar timeout
          } catch (error: any) {
            logStepV3(`Error cancelando reserva ${reserva.id}:`, 
                     { etiqueta: 'HELPER', tipo: 'error' }, 
                     error.message);
          }
        }
        
        // Esperar a que se procesen las cancelaciones
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      logStepV3(`Error al limpiar reservas para plaza ${plazaId}:`,
               { etiqueta: 'HELPER', tipo: 'warning' },
               error.message);
    }
  }


  /**
   * NUEVO: Limpieza de emergencia
   */
  private async emergencyCleanup(adminToken: string): Promise<void> {
    logStepV3('🚨 Iniciando limpieza de emergencia...', {
      etiqueta: 'EMERGENCY',
      tipo: 'warning',
    });

    this.createdReservaIds.clear();
    this.createdVehiculoIds.clear();
    this.createdPlazaIds.clear();

    // Limpiar sets obsoletos
    DataFixtures.generatedPlazaNumbers.clear();
    DataFixtures.generatedPlacas.clear();

    // Limpiar generadores unificados
    UniquenessUtil.clearAllNamespaces();

    logStepV3('✅ Limpieza de emergencia completada', {
      etiqueta: 'EMERGENCY',
      tipo: 'info',
    });
  }

/**
   * Limpia el registro de números de plaza generados y resetea contadores.
   * Útil para asegurar que cada test comience con un estado limpio.
   * Ahora delega la limpieza a DataGenerator para consistencia
   */
  static clearGeneratedPlazaNumbers(): void {
    DataGenerator.clearStaticState();
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
}
