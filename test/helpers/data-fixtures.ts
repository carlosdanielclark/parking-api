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
  fecha_inicio?: string;  // Agregar esta propiedad
  fecha_fin?: string;     // Agregar esta propiedad

}

/**
 * Helper para creación de datos de prueba en tests E2E
 * Facilita la creación de entidades con datos consistentes y realistas
 */
export class DataFixtures {
  private static vehiculoCounter = 0;
  private static testRunId: string;
  private static generatedPlazaNumbers: Set<string> = new Set();
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
      etiqueta: "CLEAR_STATE",
      tipo: "info"
    });
}

  /**
   * Crea múltiples plazas de parking
   */
  async createPlazas(
    adminToken: string,
    options: PlazaOptions = {}
  ): Promise<any[]> {
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
      const maxAttempts = 5; // Aumentado de 3 a 5
      let lastError: any = null;
      
      while (attempts < maxAttempts && !success) {
        try {
          const numeroPlaza = this.generarNumeroPlazaUnico(prefix);

          logStepV3(`Intento ${attempts + 1}/${maxAttempts}: Creando plaza ${numeroPlaza}`, {
            etiqueta: "PLAZA_CREATION",
            tipo: "info"
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
              etiqueta: "PLAZA_CREATION",
              tipo: "info"
            });
          } else {
            // Log de error no esperado
            logStepV3(`❌ Error inesperado creando plaza: Status ${response.status}`, {
              etiqueta: "PLAZA_CREATION",
              tipo: "error"
            }, response.body);
            attempts++;
          }
          
        } catch (error: any) {
          attempts++;
          lastError = error;
          
          // Log detallado del error
          logStepV3(`❌ Error en intento ${attempts}/${maxAttempts}: ${error.message}`, {
            etiqueta: "PLAZA_CREATION",
            tipo: "error"
          }, error.response?.body || error);
          
          // Si es error de duplicado, reintentar con nuevo número
          if (error.status === 422 || 
              error.message.includes('duplicad') || 
              error.message.includes('already exists') ||
              error.response?.body?.message?.includes('duplicad')) {
            
            logStepV3(`🔄 Plaza duplicada, generando nuevo número...`, {
              etiqueta: "PLAZA_CREATION",
              tipo: "warning"
            }, error.status, error.message);
            
            // Esperar antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 100 * attempts));
            continue;
          }
          
          // Si es error de conexión/timeout, reintentar
          if (error.message.includes('ECONNRESET') || 
              error.message.includes('timeout') || 
              error.code === 'ECONNRESET') {
            
            logStepV3(`Error de conexión, reintentando...`, {
              etiqueta: "PLAZA_CREATION",
              tipo: "warning"
            }, error.message);
            
            await new Promise(resolve => setTimeout(resolve, 200 * attempts));
            continue;
          }
          
          // Para otros errores, esperar un poco y reintentar
          await new Promise(resolve => setTimeout(resolve, 100 * attempts));
        }
      }
      
      if (!success) {
        logStepV3(`💥 No se pudo crear plaza después de ${maxAttempts} intentos`, {
          etiqueta: "PLAZA_CREATION",
          tipo: "error"
        }, lastError);
        throw new Error(`No se pudo crear plaza después de ${maxAttempts} intentos`);
      }
      
      // Pequeña pausa entre creación de plazas
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    logStepV3(`🅿Creadas ${plazas.length} plazas de parking`, { 
      etiqueta: "PLAZA_CREATION",
      tipo: 'info' 
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
      // Si la reserva no existe (404), no hacemos nada
      if (error.status === 404) {
        return;
      }
      throw error;
    }
  }

  /**
   * Limpieza completa y ordenada de datos de test
   * Maneja correctamente las dependencias entre entidades
   */
async cleanupComplete(adminToken: string) {
  logStepV3('Iniciando limpieza completa ordenada...', {
    etiqueta: "HELPER",
    tipo: "info"
  });
  
  try {
    // 1. Primero cancelar todas las reservas activas
    await this.cleanupReservas(adminToken);
    
    // 2. Esperar a que se procesen las cancelaciones
    await new Promise(resolve => setTimeout(resolve, 2000)); // ✅ AUMENTADO: Más tiempo
    
    // 3. Eliminar vehículos (ahora que no tienen reservas activas)
    await this.cleanupVehiculos(adminToken);
    
    // 4. Esperar antes de eliminar plazas
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 5. Finalmente eliminar plazas
    await this.cleanupPlazas(adminToken);
    
    logStepV3('Limpieza completa finalizada exitosamente', {
      etiqueta: "HELPER",
      tipo: "info"
    });
  } catch (error: any) {
    logStepV3(`Error durante limpieza completa: ${error.message}`, {
      etiqueta: "HELPER",
      tipo: "error"
    });
    // ✅ NUEVO: No lanzar error, continuar con limpieza de emergencia
    await this.emergencyCleanup(adminToken);
  }
}

  /**
   * Limpieza mejorada de plazas con mejor manejo de errores
   */
  async cleanupPlazas(adminToken: string) {
    let deletedCount = 0;
    const plazaIds = Array.from(this.createdPlazaIds);
    
    for (const plazaId of plazaIds) {
      try {
        // Verificar si la plaza existe antes de intentar eliminarla
        const response = await this.request.get(`/plazas/${plazaId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        
        if (response.status === 200) {
          // Intentar eliminar la plaza
          await this.request.delete(`/plazas/${plazaId}`)
            .set('Authorization', `Bearer ${adminToken}`);
          
          logStepV3(`Plaza ${plazaId} eliminada exitosamente`, {etiqueta: "Cleanup-Plazas"});
          deletedCount++;
        }
      } catch (error) {
        if (error.response?.status === 404) {
          logStepV3(`Plaza ${plazaId} no existe, omitiendo eliminación`, {etiqueta:"Cleanup-Plazas"});
        } else if (error.response?.status === 400 && 
                  error.response?.body?.message?.includes('reservas activas')) {
          logStepV3(`Plaza ${plazaId} tiene reservas activas, omitiendo eliminación`, {etiqueta:"Cleanup-Plazas", tipo:"warning"});
        } else {
          logStepV3(`Error al eliminar plaza ${plazaId}: ${error.response?.body?.message || error.message}`, {etiqueta:"Cleanup-Plazas", tipo:"warning"});
        }
      }
    }
    
    logStepV3(`Eliminadas ${deletedCount} de ${plazaIds.length} plazas de prueba`, {etiqueta:"Cleanup-Plazas", tipo:"info"});
    this.createdPlazaIds.clear();
  }

  /**
   * Limpieza mejorada de reserva con mejor manejo de errores
   */
  async cleanupReservas(adminToken: string) {
    for (const reservaId of this.createdReservaIds) {
      try {
        // Verificar si la reserva existe antes de intentar cancelarla
        const response = await this.request.get(`/reservas/${reservaId}`).set('Authorization', `Bearer ${adminToken}`);
        
        if (response.status === 200) {
          await this.request.post(`/reservas/${reservaId}/cancelar`).set('Authorization', `Bearer ${adminToken}`);
          logStepV3(`Reserva ${reservaId} cancelada exitosamente`, {etiqueta: "Cleanup-Reserva"});
        }
      } catch (error) {
        if (error.response?.status === 404) {
          logStepV3(`Reserva ${reservaId} no existe, omitiendo cancelación`, {etiqueta: "Cleanup-Reserva"});
        } else {
          logStepV3(`Error al cancelar reserva ${reservaId}: ${error.message}`, {etiqueta: "CLeanup-Reserva"});
        }
      }
    }
    this.createdReservaIds.clear();
  }

  /**
   * Limpieza mejorada de vehiculo con mejor manejo de errores
   */
  async cleanupVehiculos(adminToken: string) {
    let deletedCount = 0;
    const vehiculoIds = Array.from(this.createdVehiculoIds);
    
    for (const vehiculoId of vehiculoIds) {
      try {
        // Verificar si el vehículo existe antes de intentar eliminarlo
        const response = await this.request.get(`/vehiculos/${vehiculoId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        
        if (response.status === 200) {
          // Intentar eliminar el vehículo
          await this.request.delete(`/vehiculos/${vehiculoId}`)
            .set('Authorization', `Bearer ${adminToken}`);
          
          logStepV3(`Vehículo ${vehiculoId} eliminado exitosamente`, {etiqueta: "Cleanup-Vehiculos"});
          deletedCount++;
        }
      } catch (error) {
        if (error.response?.status === 404) {
          logStepV3(`Vehículo ${vehiculoId} no existe, omitiendo eliminación`, {etiqueta: "Cleanup-Vehiculos"});
        } else if (error.response?.status === 400 && 
                  error.response?.body?.message?.includes('reservas activas')) {
          logStepV3(`Vehículo ${vehiculoId} tiene reservas activas, omitiendo eliminación`, {tipo:'warning', etiqueta:"CLeanup-Vehiculos"});
        } else {
          logStepV3(`Error al eliminar vehículo ${vehiculoId}: ${error.response?.body?.message || error.message}`, {tipo:'warning', etiqueta:"CLeanup-Vehiculos"});
        }
      }
    }
    
    logStepV3(`Eliminados ${deletedCount} de ${vehiculoIds.length} vehículos de prueba`, {
      etiqueta:"CLeanup-Vehiculos",
      tipo: "info"
    });
    this.createdVehiculoIds.clear();
  }

  /**
   * Crea un vehículo para un usuario
   */
  async createVehiculo(
    clienteId: string,
    clienteToken: string,
    options: VehiculoOptions = {}
  ): Promise<any> {
    
    const vehiculoData = {
      placa: options.placa || this.generateUniquePlaca('TST'),
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
      logStepV3(`❌ Placa excede límite: "${vehiculoData.placa}" (${vehiculoData.placa.length} chars)`, {
        etiqueta: "VEHICULO_VALIDATION",
        tipo: "error"
      });
      throw new Error(`Placa inválida: "${vehiculoData.placa}" excede 10 caracteres (actual: ${vehiculoData.placa.length})`);
    }
    
    // ✅ VALIDACIÓN DE FORMATO: solo alfanuméricos
    if (!/^[A-Z0-9]+$/.test(vehiculoData.placa)) {
      throw new Error(`Placa inválida: "${vehiculoData.placa}" contiene caracteres no válidos`);
    }

    if (!clienteId || !clienteToken) {
      throw new Error('clienteId y clienteToken son requeridos');
    }

    logStepV3(`🚗 Creando vehículo con placa: "${vehiculoData.placa}" (${vehiculoData.placa.length} chars)`, {
      etiqueta: "VEHICULO_CREATE",
      tipo: "info"
    });

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

      logStepV3(`✅ Vehículo creado: ${vehiculoData.placa} (${vehiculoData.marca} ${vehiculoData.modelo})`, {
        etiqueta: "HELPER", 
        tipo: "info"
      });
      
      return response.body.data;
    } catch (error: any) {
      logStepV3(`❌ Error creando vehículo con placa ${vehiculoData.placa}:`, {
        etiqueta: "HELPER", 
        tipo: "error"
      }, {
        status: error.status,
        message: error.message,
        body: error.response?.body,
        vehiculoData
      });
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
        placa: `MLT${(i + 1).toString().padStart(3, '0')}`,
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
      { tipo: 'info' },
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
      
      // Pequeña pausa para evitar conflictos de concurrencia
      await new Promise(resolve => setTimeout(resolve, 100));
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
      const inicio = new Date(ahora.getTime() - (diasAtras * 24 * 60 * 60 * 1000) - (2 * 60 * 60 * 1000));
      const fin = new Date(inicio.getTime() + (60 * 60 * 1000)); // 1 hora de duración

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
      
      // Calcular fechas
      const fechaInicio = new Date();
      fechaInicio.setMinutes(fechaInicio.getMinutes() + 0.1 * 60); // 0.1 horas = 6 minutos

      const duracionHoras = 2 + Math.floor(Math.random() * 3);
      const fechaFin = new Date(fechaInicio);
      fechaFin.setHours(fechaFin.getHours() + duracionHoras);

      // Crear reserva
      const reserva = await this.createReserva(cliente.token, {
        usuario_id: cliente.userId,
        plaza: plazas[i],         // pasar objeto completo
        vehiculo_id: cliente.vehiculoId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      reservas.push(reserva);
    }

    logStepV3(`📊 Simulada ocupación del ${(occupancyPercentage * 100).toFixed(0)}%: ${reservas.length}/${plazas.length} plazas ocupadas`);
    return reservas;
  }

  /**
   * Crea escenario completo de testing con múltiples entidades
   */
  async createCompleteScenario(adminToken: string): Promise<{
    plazas: any[];
    clientes: Array<{ userId: string; vehiculoId: string; token: string; user: any; vehiculo: any }>;
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
      // Calcular fechas de ejemplo
      const fechaInicio = new Date();  
      fechaInicio.setMinutes(fechaInicio.getMinutes() + i * 10); // Diferenciar inicio por cada reserva

      const duracionHoras = 2; // o cualquier valor dinámico que necesites
      const fechaFin = new Date(fechaInicio);
      fechaFin.setHours(fechaFin.getHours() + duracionHoras);

      // Llamada correcta a createReserva
      const reserva = await this.createReserva(clientes[i].token, {
        usuario_id: clientes[i].userId,
        plaza: plazas[i],         // pasar objeto completo
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
    const maxIntentos = 15; // ✅ AUMENTADO para más oportunidades
    
    while (intentos < maxIntentos) {
      DataFixtures.placaCounter++;
      
      // ✅ FORMATO OPTIMIZADO para máximo 10 caracteres
      // PREFIX: máximo 2 caracteres
      const shortPrefix = prefix.substring(0, 2).toUpperCase();
      
      // COUNTER: 2 dígitos (00-99, luego reinicia)
      const counter = (DataFixtures.placaCounter % 100).toString().padStart(2, '0');
      
      // TIMESTAMP: 3 caracteres (últimos 3 de base36)
      const timestamp = Date.now().toString(36).slice(-3).toUpperCase();
      
      // RANDOM: 3 caracteres
      const random = Math.random().toString(36).substring(2, 5).toUpperCase();
      
      // ✅ CONSTRUCCIÓN: 2 + 2 + 3 + 3 = 10 caracteres máximo
      const placa = `${shortPrefix}${counter}${timestamp}${random}`;
      
      // ✅ VALIDACIÓN DE LONGITUD antes de verificar unicidad
      if (placa.length > 10) {
        logStepV3(`⚠️ Placa generada excede 10 chars: ${placa} (${placa.length})`, {
          etiqueta: "PLACA_GEN",
          tipo: "warning"
        });
        intentos++;
        continue;
      }
      
      // Verificar unicidad
      if (!DataFixtures.generatedPlacas.has(placa)) {
        DataFixtures.generatedPlacas.add(placa);
        
        logStepV3(`✅ Placa generada: ${placa} (${placa.length} chars)`, {
          etiqueta: "PLACA_GEN",
          tipo: "info"
        });
        
        return placa;
      }
      
      intentos++;
    }
    
    // ✅ FALLBACK: Si no se puede generar única, usar timestamp simple
    const fallbackPlaca = `${prefix.substring(0, 2)}${Date.now().toString().slice(-6)}`.substring(0, 10);
    
    logStepV3(`⚡ Usando placa fallback: ${fallbackPlaca}`, {
      etiqueta: "PLACA_GEN",
      tipo: "warning"
    });
    
    return fallbackPlaca;
  }

  async waitForPlazaState(app: INestApplication, plazaId: number, estadoEsperado: EstadoPlaza, authHelper: AuthHelper, usuarios: any, intentosMax = 10, delayMs = 100) {
    let intentos = 0;
    while (intentos < intentosMax) {
      const response = await request(app.getHttpServer())
        .get(`/plazas/${plazaId}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token));
      if (response.body.data.estado === estadoEsperado) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
      intentos++;
    }
    throw new Error(`La plaza no alcanzó el estado ${estadoEsperado} después de ${intentosMax} intentos`);
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
  private generarNumeroPlazaUnico(prefix: string): string {
    // Asegurar que el prefijo no exceda 1 carácter para dejar espacio para 4 dígitos
    const shortPrefix = prefix.substring(0, 1);
    
    // Generar un número aleatorio de 4 dígitos
    const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    // Combinar prefijo (1 char) + número (4 chars) = total 5 caracteres
    const numeroPlaza = `${shortPrefix}${randomNumber}`;
    
    // Verificar que no se haya generado recientemente
    if (DataFixtures.generatedPlazaNumbers.has(numeroPlaza)) {
      // Si ya existe, generar uno nuevo
      return this.generarNumeroPlazaUnico(prefix);
    }
    
    DataFixtures.generatedPlazaNumbers.add(numeroPlaza);
    return numeroPlaza;
  }

  // Agregar este método para verificar existencia antes de eliminar
  private async safeDeleteEntity(
    endpoint: string,
    id: string,
    adminToken: string,
    entityName: string
  ): Promise<boolean> {
    try {
      // Primero verificar si existe
      const getResponse = await request(this.app.getHttpServer())
        .get(`${endpoint}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(5000)
        .catch(() => ({ status: 404 }));

      if (getResponse.status !== 200) {
        logStepV3(`${entityName} ${id} no existe, omitiendo eliminación`, {
          etiqueta: "HELPER", 
          tipo: "info"
        });
        return false;
      }

      // Si existe, intentar eliminar
      const deleteResponse = await request(this.app.getHttpServer())
        .delete(`${endpoint}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(10000);

      if (deleteResponse.status === 200 || deleteResponse.status === 204) {
        logStepV3(`${entityName} ${id} eliminado`, {etiqueta: "HELPER"});
        return true;
      }

      return false;
      
    } catch (error) {
      const errorMessage = error.message || '';
      if (!errorMessage.includes('404') && 
          !errorMessage.includes('not found')) {
        logStepV3(`Error eliminando ${entityName} ${id}:`, {
          etiqueta: "HELPER", 
          tipo: "warning"
        }, errorMessage);
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
      // Obtener todas las reservas de la plaza
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
          } catch (error) {
            // Ignorar errores de cancelación
            logStepV3(`Ignorar errores de cancelación:`,  {etiqueta: "HELPER", tipo:"error"}, error.message);
          }
        }
      }
    } catch (error) {
      logStepV3(`Error al limpiar reservas para plaza ${plazaId}:`,  {etiqueta: "HELPER", tipo:"warning"},error.message);
    }
  }

/**
 * ✅ NUEVO: Método de limpieza de emergencia
 */
private async emergencyCleanup(adminToken: string) {
  logStepV3('Iniciando limpieza de emergencia...', {
    etiqueta: "EMERGENCY",
    tipo: "warning"
  });

  // Limpiar Sets de tracking
  this.createdReservaIds.clear();
  this.createdVehiculoIds.clear();
  this.createdPlazaIds.clear();
  
  // Limpiar Sets estáticos
  DataFixtures.generatedPlazaNumbers.clear();
  DataFixtures.generatedPlacas.clear();
  
  logStepV3('Limpieza de emergencia completada', {
    etiqueta: "EMERGENCY",
    tipo: "info"
  });
}

}
