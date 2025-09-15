// Archivo: test/helpers/domain/vehiculo-helper.ts
// NUEVO - Helper especializado para operaciones con vehículos
import request from 'supertest';
import { logStepV3 } from '../log/log-util';
import { IdUniqueness } from '../data/id-uniqueness';

/**
 * Helper especializado para operaciones con vehículos
 * Usa placas únicas y validaciones consistentes
 */
export class VehiculoHelper {
  /**
   * Crear un vehículo único con validaciones
   */
  static async createUniqueVehiculo(
    app: any,
    clienteId: string,
    token: string,
    opts: Partial<{
      placa: string;
      marca: string;
      modelo: string;
      color: string;
    }> = {}
  ) {
    // Usar generador unificado por defecto
    const placa = opts.placa ?? IdUniqueness.genPlaca();

    // Validación de formato
    if (!/^[A-Z0-9]+$/.test(placa) || placa.length > 10) {
      throw new Error(`Placa inválida: ${placa} (formato: [A-Z0-9]{1,10})`);
    }

    const payload = {
      placa,
      marca: opts.marca || 'Toyota',
      modelo: opts.modelo || 'Corolla',
      color: opts.color || 'Blanco',
      usuario_id: clienteId,
    };

    logStepV3(`🚗 Creando vehículo ${placa}`, { 
      etiqueta: 'VEHICULO_HELPER' 
    });

    try {
      const response = await request(app.getHttpServer())
        .post('/vehiculos')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      logStepV3(`✅ Vehículo creado ${placa}`, { 
        etiqueta: 'VEHICULO_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3(`❌ Error creando vehículo ${placa}:`, { 
        etiqueta: 'VEHICULO_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Crear múltiples vehículos para un cliente
   */
  static async createMultipleVehiculos(
    app: any,
    clienteId: string,
    token: string,
    count: number = 3,
    prefix: string = 'TST'
  ) {
    const vehiculos: any[] = [];

    for (let i = 0; i < count; i++) {
      const vehiculo = await this.createUniqueVehiculo(app, clienteId, token, {});
      vehiculos.push(vehiculo);
      
      // Pausa pequeña entre creaciones
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    logStepV3(`🚗 Creados ${vehiculos.length} vehículos para cliente ${clienteId}`, { 
      etiqueta: 'VEHICULO_HELPER' 
    });

    return vehiculos;
  }

  /**
   * Crear vehículos con datos específicos para testing
   */
  static async createTestVehiculos(
    app: any,
    clienteId: string,
    token: string
  ) {
    const vehiculos = [
      {
        placa: IdUniqueness.genPlaca(),
        marca: 'Toyota',
        modelo: 'Corolla',
        color: 'Blanco'
      },
      {
        placa: IdUniqueness.genPlaca(),
        marca: 'Honda',
        modelo: 'Civic',
        color: 'Negro'
      },
      {
        placa: IdUniqueness.genPlaca(),
        marca: 'Ford',
        modelo: 'Focus',
        color: 'Azul'
      }
    ];

    const created: any[] = [];
    for (const vehiculoData of vehiculos) {
      const vehiculo = await this.createUniqueVehiculo(app, clienteId, token, vehiculoData);
      created.push(vehiculo);
    }

    return created;
  }

  /**
   * Obtener vehículo por placa
   */
  static async getVehiculoByPlaca(
    app: any,
    token: string,
    placa: string
  ) {
    try {
      const response = await request(app.getHttpServer())
        .get(`/vehiculos?placa=${placa}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return response.body.data.find((vehiculo: any) => vehiculo.placa === placa);
    } catch (error: any) {
      logStepV3(`Error obteniendo vehículo ${placa}:`, { 
        etiqueta: 'VEHICULO_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Actualizar información de un vehículo
   */
  static async updateVehiculo(
    app: any,
    token: string,
    vehiculoId: string,
    updates: Partial<{
      marca: string;
      modelo: string;
      color: string;
    }>
  ) {
    try {
      const response = await request(app.getHttpServer())
        .patch(`/vehiculos/${vehiculoId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updates)
        .expect(200);

      logStepV3(`🔄 Vehículo ${vehiculoId} actualizado`, { 
        etiqueta: 'VEHICULO_HELPER' 
      }, updates);

      return response.body.data;
    } catch (error: any) {
      logStepV3(`Error actualizando vehículo ${vehiculoId}:`, { 
        etiqueta: 'VEHICULO_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Eliminar vehículo de forma segura
   */
  static async deleteVehiculo(
    app: any,
    token: string,
    vehiculoId: string,
    maxRetries: number = 3
  ): Promise<boolean> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await request(app.getHttpServer())
          .delete(`/vehiculos/${vehiculoId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        logStepV3(`🗑️ Vehículo ${vehiculoId} eliminado exitosamente`, { 
          etiqueta: 'VEHICULO_HELPER' 
        });
        return true;

      } catch (error: any) {
        if (error.status === 404) {
          logStepV3(`Vehículo ${vehiculoId} no existe (404)`, { 
            etiqueta: 'VEHICULO_HELPER', 
            tipo: 'warning' 
          });
          return true; // Considerar como éxito si ya no existe
        }

        if (error.status === 400 && 
            error?.response?.body?.message?.includes('reservas activas')) {
          
          logStepV3(`Vehículo ${vehiculoId} tiene reservas activas, reintento ${attempt}/${maxRetries}`, { 
            etiqueta: 'VEHICULO_HELPER', 
            tipo: 'warning' 
          });
          
          if (attempt < maxRetries) {
            // Esperar antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
        }

        logStepV3(`Error eliminando vehículo ${vehiculoId}:`, { 
          etiqueta: 'VEHICULO_HELPER', 
          tipo: 'error' 
        }, error?.response?.body);
        
        if (attempt === maxRetries) {
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Obtener todos los vehículos de un cliente
   */
  static async getVehiculosCliente(
    app: any,
    token: string,
    clienteId: string
  ) {
    try {
      const response = await request(app.getHttpServer())
        .get(`/vehiculos?usuario_id=${clienteId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      logStepV3(`📋 Obtenidos ${response.body.data.length} vehículos del cliente ${clienteId}`, { 
        etiqueta: 'VEHICULO_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3(`Error obteniendo vehículos del cliente ${clienteId}:`, { 
        etiqueta: 'VEHICULO_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Validar formato de placa
   */
  static validatePlaca(placa: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!placa) {
      errors.push('Placa es requerida');
    } else {
      if (placa.length > 10) {
        errors.push(`Placa excede 10 caracteres (actual: ${placa.length})`);
      }
      
      if (placa.length < 1) {
        errors.push('Placa debe tener al menos 1 caracter');
      }
      
      if (!/^[A-Z0-9]+$/.test(placa)) {
        errors.push('Placa solo puede contener letras mayúsculas y números');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generar datos de vehículo aleatorios para testing
   */
  static generateRandomVehiculoData() {
    const marcas = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes', 'Audi'];
    const modelos = ['Sedan', 'Corolla', 'Civic', 'Focus', 'Aveo', 'X3', 'C-Class', 'A4'];
    const colores = ['Blanco', 'Negro', 'Gris', 'Rojo', 'Azul', 'Plata', 'Verde'];

    return {
      placa: IdUniqueness.genPlaca(),
      marca: marcas[Math.floor(Math.random() * marcas.length)],
      modelo: modelos[Math.floor(Math.random() * modelos.length)],
      color: colores[Math.floor(Math.random() * colores.length)]
    };
  }
}
