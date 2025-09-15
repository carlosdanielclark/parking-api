// Archivo: test/helpers/domain/plaza-helper.ts
// MODIFICADO - Alineado con numero_plaza y generadores unificados
import request from 'supertest';
import { logStepV3 } from '../log/log-util';
import { IdUniqueness } from '../data/id-uniqueness';

/**
 * Helper especializado para operaciones con plazas de parking
 * Usa numero_plaza consistentemente y generadores unificados
 */
export class PlazaHelper {
  /**
   * Crear una plaza única con reintentos en caso de duplicados
   */
  static async createUniquePlaza(
    app: any,
    token: string,
    maxRetries: number = 5
  ): Promise<{ id: number; numero_plaza: string }> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Usar generador unificado
        const numero_plaza = IdUniqueness.genNumeroPlaza('A');
        
        logStepV3(`Intento ${attempt}/${maxRetries}: Creando plaza ${numero_plaza}`, { 
          etiqueta: 'PLAZA_HELPER' 
        });

        const response = await request(app.getHttpServer())
          .post('/plazas')
          .set('Authorization', `Bearer ${token}`)
          .send({ 
            numero_plaza,  // Campo alineado con backend
            tipo: 'NORMAL', 
            estado: 'LIBRE' 
          })
          .expect(201);

        logStepV3(`✅ Plaza creada exitosamente: ${numero_plaza}`, { 
          etiqueta: 'PLAZA_HELPER' 
        });

        return { 
          id: response.body.data.id, 
          numero_plaza 
        };
        
      } catch (error: any) {
        const isDup = error?.status === 422 ||
          error?.response?.body?.message?.toString().toLowerCase().includes('existe') ||
          error?.message?.toLowerCase().includes('existe');

        if (isDup) {
          logStepV3(`⚠️ Plaza duplicada, reintentando...`, { 
            etiqueta: 'PLAZA_HELPER', 
            tipo: 'warning' 
          });
          
          if (attempt === maxRetries) {
            throw new Error(`No se pudo crear plaza única después de ${maxRetries} intentos`);
          }
          
          // Backoff incremental
          await new Promise((r) => setTimeout(r, 50 * attempt));
          continue;
        }

        // Otros errores se lanzan inmediatamente
        logStepV3(`❌ Error inesperado creando plaza: ${error.message}`, { 
          etiqueta: 'PLAZA_HELPER', 
          tipo: 'error' 
        }, error?.response?.body);
        throw error;
      }
    }
    
    throw new Error('No se pudo crear la plaza después de todos los intentos');
  }

  /**
   * Crear múltiples plazas con paralelización controlada
   */
  static async createMultiplePlazas(
    app: any, 
    token: string, 
    count: number
  ): Promise<Array<{ id: number; numero_plaza: string }>> {
    
    const plazas: Array<{ id: number; numero_plaza: string }> = [];
    const batchSize = 10; // Procesar en lotes para evitar saturación
    
    for (let i = 0; i < count; i += batchSize) {
      const batchPromises: Promise<{ id: number; numero_plaza: string }>[] = [];
      const batchEnd = Math.min(i + batchSize, count);
      
      for (let j = i; j < batchEnd; j++) {
        batchPromises.push(this.createUniquePlaza(app, token, 5));
      }
      
      const batchResults = await Promise.all(batchPromises);
      plazas.push(...batchResults);
      
      // Pausa entre lotes para evitar saturar el backend
      if (i + batchSize < count) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logStepV3(`🅿 Creadas ${plazas.length} plazas de parking`, { 
      etiqueta: 'PLAZA_HELPER' 
    });
    return plazas;
  }

  /**
   * Crear plazas con diferentes tipos y estados
   */
  static async createMixedPlazas(
    app: any,
    token: string,
    config: {
      normales?: number;
      discapacitados?: number;
      vip?: number;
      prefix?: string;
    } = {}
  ) {
    const { normales = 5, discapacitados = 2, vip = 1, prefix = 'A' } = config;
    const plazas: any[] = [];

    // Crear plazas normales
    for (let i = 0; i < normales; i++) {
      const numero_plaza = IdUniqueness.genNumeroPlaza(prefix);
      const response = await request(app.getHttpServer())
        .post('/plazas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          numero_plaza,
          tipo: 'NORMAL',
          estado: 'LIBRE'
        })
        .expect(201);
      
      plazas.push(response.body.data);
    }

    // Crear plazas para discapacitados
    for (let i = 0; i < discapacitados; i++) {
      const numero_plaza = IdUniqueness.genNumeroPlaza('D');
      const response = await request(app.getHttpServer())
        .post('/plazas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          numero_plaza,
          tipo: 'DISCAPACITADOS',
          estado: 'LIBRE'
        })
        .expect(201);
      
      plazas.push(response.body.data);
    }

    // Crear plazas VIP
    for (let i = 0; i < vip; i++) {
      const numero_plaza = IdUniqueness.genNumeroPlaza('V');
      const response = await request(app.getHttpServer())
        .post('/plazas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          numero_plaza,
          tipo: 'VIP',
          estado: 'LIBRE'
        })
        .expect(201);
      
      plazas.push(response.body.data);
    }

    logStepV3(`🏗️ Creadas ${plazas.length} plazas mixtas`, { 
      etiqueta: 'PLAZA_HELPER' 
    }, {
      normales,
      discapacitados,
      vip
    });

    return plazas;
  }

  /**
   * Obtener plaza por numero_plaza
   */
  static async getPlazaByNumero(
    app: any,
    token: string,
    numero_plaza: string
  ) {
    try {
      const response = await request(app.getHttpServer())
        .get(`/plazas?numero_plaza=${numero_plaza}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return response.body.data.find((plaza: any) => plaza.numero_plaza === numero_plaza);
    } catch (error: any) {
      logStepV3(`Error obteniendo plaza ${numero_plaza}:`, { 
        etiqueta: 'PLAZA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Actualizar estado de una plaza
   */
  static async updatePlazaEstado(
    app: any,
    token: string,
    plazaId: number,
    nuevoEstado: 'LIBRE' | 'OCUPADA' | 'MANTENIMIENTO'
  ) {
    try {
      const response = await request(app.getHttpServer())
        .patch(`/plazas/${plazaId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ estado: nuevoEstado })
        .expect(200);

      logStepV3(`🔄 Plaza ${plazaId} actualizada a estado: ${nuevoEstado}`, { 
        etiqueta: 'PLAZA_HELPER' 
      });

      return response.body.data;
    } catch (error: any) {
      logStepV3(`Error actualizando plaza ${plazaId}:`, { 
        etiqueta: 'PLAZA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }

  /**
   * Eliminar plaza de forma segura
   */
  static async deletePlaza(
    app: any,
    token: string,
    plazaId: number,
    maxRetries: number = 3
  ): Promise<boolean> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await request(app.getHttpServer())
          .delete(`/plazas/${plazaId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        logStepV3(`🗑️ Plaza ${plazaId} eliminada exitosamente`, { 
          etiqueta: 'PLAZA_HELPER' 
        });
        return true;

      } catch (error: any) {
        if (error.status === 404) {
          logStepV3(`Plaza ${plazaId} no existe (404)`, { 
            etiqueta: 'PLAZA_HELPER', 
            tipo: 'warning' 
          });
          return true; // Considerar como éxito si ya no existe
        }

        if (error.status === 400 && 
            error?.response?.body?.message?.includes('reservas activas')) {
          
          logStepV3(`Plaza ${plazaId} tiene reservas activas, reintento ${attempt}/${maxRetries}`, { 
            etiqueta: 'PLAZA_HELPER', 
            tipo: 'warning' 
          });
          
          if (attempt < maxRetries) {
            // Esperar antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
        }

        logStepV3(`Error eliminando plaza ${plazaId}:`, { 
          etiqueta: 'PLAZA_HELPER', 
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
   * Verificar disponibilidad de plazas
   */
  static async checkDisponibilidad(
    app: any,
    token: string
  ) {
    try {
      const response = await request(app.getHttpServer())
        .get('/plazas/disponibilidad')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      logStepV3('📊 Disponibilidad consultada', { 
        etiqueta: 'PLAZA_HELPER' 
      }, response.body.data);

      return response.body.data;
    } catch (error: any) {
      logStepV3('Error consultando disponibilidad:', { 
        etiqueta: 'PLAZA_HELPER', 
        tipo: 'error' 
      }, error?.response?.body);
      throw error;
    }
  }
}
