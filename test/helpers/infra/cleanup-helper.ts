// Archivo: test/helpers/infra/cleanup-helper.ts
// MODIFICADO - Mejorado con orden correcto y reseteo de secuencias
import { DataSource } from 'typeorm';
import { DataGenerator } from '../data/data-generator';
import { logStepV3 } from '../log/log-util';

/**
 * Helper para limpieza exhaustiva de base de datos
 * Maneja el orden correcto de eliminación y reseteo de secuencias
 */
export class CleanupHelper {
  /**
   * Limpieza completa y exhaustiva de base de datos
   */
  static async cleanupAll(dataSource: DataSource): Promise<void> {
    try {     
      // 1. Limpiar estado estático PRIMERO
      DataGenerator.clearStaticState();
      
      // 2. Ejecutar limpieza de base de datos en orden correcto
      await dataSource.query('SET session_replication_role = replica;');
      
      // Orden correcto: FK dependencies primero - USAR "usuarios" y "cliente" en minúscula
      await dataSource.query('DELETE FROM reservas;');
      await dataSource.query('DELETE FROM vehiculos;');  
      await dataSource.query('DELETE FROM plazas;');
      await dataSource.query('DELETE FROM usuarios WHERE role = $1;', ['cliente']); // ← Cambiado a minúscula
      
      // 3. Resetear secuencias para evitar IDs acumulados
      // Verificar nombres exactos de secuencias basado en tu estructura
      await dataSource.query('ALTER SEQUENCE IF EXISTS reservas_id_seq RESTART WITH 1;');
      await dataSource.query('ALTER SEQUENCE IF EXISTS vehiculos_id_seq RESTART WITH 1;');
      await dataSource.query('ALTER SEQUENCE IF EXISTS plazas_id_seq RESTART WITH 1;');
      // La secuencia para usuarios probablemente no existe ya que usas UUID
      // await dataSource.query('ALTER SEQUENCE IF EXISTS usuarios_id_seq RESTART WITH 1;');
      
      await dataSource.query('SET session_replication_role = DEFAULT;');
    
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Verificar que la limpieza fue exitosa
   */
  static async verifyCleanupSuccess(dataSource: DataSource): Promise<void> {
    const plazasCount = await dataSource.query('SELECT COUNT(*) as count FROM plazas;');
    const vehiculosCount = await dataSource.query('SELECT COUNT(*) as count FROM vehiculos;');
    const reservasCount = await dataSource.query('SELECT COUNT(*) as count FROM reservas;');
    
    const counts = {
      plazas: parseInt(plazasCount[0].count),
      vehiculos: parseInt(vehiculosCount[0].count),
      reservas: parseInt(reservasCount[0].count)
    };
    
    if (counts.plazas > 0 || counts.vehiculos > 0 || counts.reservas > 0) {
      logStepV3('❌ Limpieza incompleta detectada', {
        etiqueta: 'CLEANUP',
        tipo: 'error'
      }, counts);
      throw new Error(`Limpieza incompleta: ${JSON.stringify(counts)}`);
    }
    
    logStepV3('✅ Verificación de limpieza: Base de datos completamente limpia', {
      etiqueta: 'CLEANUP',
      tipo: 'info'
    });
  }

  /**
   * Limpieza selectiva por tipo de entidad
   */
  static async cleanupByEntity(
    dataSource: DataSource, 
    entities: ('reservas' | 'vehiculos' | 'plazas' | 'users')[]
  ): Promise<void> {
    try {
      logStepV3(`🧹 Iniciando limpieza selectiva: ${entities.join(', ')}`, {
        etiqueta: 'CLEANUP',
        tipo: 'info'
      });

      await dataSource.query('SET session_replication_role = replica;');

      // Eliminar en orden correcto según dependencias
      const order = ['reservas', 'vehiculos', 'plazas', 'users'];
      
      for (const entity of order) {
        if (entities.includes(entity as any)) {
          if (entity === 'users') {
            await dataSource.query('DELETE FROM users WHERE role = $1;', ['CLIENTE']);
          } else {
            await dataSource.query(`DELETE FROM ${entity};`);
          }
          
          // Resetear secuencia correspondiente
          await dataSource.query(`ALTER SEQUENCE IF EXISTS ${entity}_id_seq RESTART WITH 1;`);
          
          logStepV3(`✅ Limpieza de ${entity} completada`, {
            etiqueta: 'CLEANUP',
            tipo: 'info'
          });
        }
      }

      await dataSource.query('SET session_replication_role = DEFAULT;');

      logStepV3('✅ Limpieza selectiva completada', {
        etiqueta: 'CLEANUP',
        tipo: 'info'
      });

    } catch (error: any) {
      logStepV3(`❌ Error en limpieza selectiva: ${error.message}`, {
        etiqueta: 'CLEANUP',
        tipo: 'error'
      });
      throw error;
    }
  }

  /**
   * Limpieza suave que preserva datos críticos del sistema
   */
  static async softCleanup(dataSource: DataSource): Promise<void> {
    try {
      logStepV3('🧹 Iniciando limpieza suave (preserva datos del sistema)', {
        etiqueta: 'CLEANUP',
        tipo: 'info'
      });

      // Solo limpiar estado estático
      DataGenerator.clearStaticState();

      await dataSource.query('SET session_replication_role = replica;');

      // Eliminar solo reservas y mantener estructura básica
      await dataSource.query('DELETE FROM reservas;');
      
      // Eliminar solo vehículos de test (por ejemplo, placas que contienen 'TEST' o 'TMP')
      await dataSource.query(`DELETE FROM vehiculos WHERE placa LIKE '%TEST%' OR placa LIKE '%TMP%';`);
      
      // Eliminar solo plazas de test (por ejemplo, numero_plaza que empiecen con 'A', 'B')
      await dataSource.query(`DELETE FROM plazas WHERE numero_plaza LIKE 'A%' OR numero_plaza LIKE 'B%';`);

      await dataSource.query('SET session_replication_role = DEFAULT;');

      logStepV3('✅ Limpieza suave completada', {
        etiqueta: 'CLEANUP',
        tipo: 'info'
      });

    } catch (error: any) {
      logStepV3(`❌ Error en limpieza suave: ${error.message}`, {
        etiqueta: 'CLEANUP',
        tipo: 'error'
      });
      throw error;
    }
  }

  /**
   * Obtener estadísticas de la base de datos
   */
  static async getDatabaseStats(dataSource: DataSource): Promise<{
    plazas: number;
    vehiculos: number;
    reservas: number;
    users: number;
  }> {
    try {
      const [plazasResult, vehiculosResult, reservasResult, usersResult] = await Promise.all([
        dataSource.query('SELECT COUNT(*) as count FROM plazas;'),
        dataSource.query('SELECT COUNT(*) as count FROM vehiculos;'),
        dataSource.query('SELECT COUNT(*) as count FROM reservas;'),
        dataSource.query('SELECT COUNT(*) as count FROM users;')
      ]);

      const stats = {
        plazas: parseInt(plazasResult[0].count),
        vehiculos: parseInt(vehiculosResult[0].count),
        reservas: parseInt(reservasResult[0].count),
        users: parseInt(usersResult[0].count)
      };

      logStepV3('📊 Estadísticas de base de datos', {
        etiqueta: 'CLEANUP',
        tipo: 'info'
      }, stats);

      return stats;
    } catch (error: any) {
      logStepV3(`❌ Error obteniendo estadísticas: ${error.message}`, {
        etiqueta: 'CLEANUP',
        tipo: 'error'
      });
      throw error;
    }
  }

  /**
   * Cleanup de emergencia para casos críticos
   */
  static async emergencyCleanup(dataSource: DataSource): Promise<void> {
    try {
      logStepV3('🚨 Iniciando limpieza de emergencia', {
        etiqueta: 'EMERGENCY_CLEANUP',
        tipo: 'warning'
      });

      // Limpiar estado estático primero
      DataGenerator.clearStaticState();

      // Forzar eliminación sin verificaciones
      await dataSource.query('SET session_replication_role = replica;');
      
      // Usar TRUNCATE CASCADE para forzar limpieza
      await dataSource.query('TRUNCATE TABLE reservas, vehiculos, plazas RESTART IDENTITY CASCADE;');
      
      // Eliminar usuarios de test
      await dataSource.query('DELETE FROM users WHERE email LIKE \'%test%\' OR email LIKE \'%@test.com\';');
      
      await dataSource.query('SET session_replication_role = DEFAULT;');

    } catch (error: any) {
      logStepV3(`❌ Error crítico en limpieza de emergencia: ${error.message}`, {
        etiqueta: 'EMERGENCY_CLEANUP',
        tipo: 'error'
      });
      
      // Como último recurso, intentar limpiar tablas individualmente
      try {
        await dataSource.query('DELETE FROM reservas;');
        await dataSource.query('DELETE FROM vehiculos;');
        await dataSource.query('DELETE FROM plazas;');
        logStepV3('⚡ Limpieza individual de emergencia ejecutada', {
          etiqueta: 'EMERGENCY_CLEANUP',
          tipo: 'warning'
        });
      } catch (finalError: any) {
        logStepV3(`💥 Fallo crítico en limpieza final: ${finalError.message}`, {
          etiqueta: 'EMERGENCY_CLEANUP',
          tipo: 'error'
        });
        throw finalError;
      }
    }
  }
}