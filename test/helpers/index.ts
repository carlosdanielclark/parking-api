// Archivo: test/helpers/index.ts
// NUEVO - Barrel file for clean imports
import { DataSource } from 'typeorm';
import { AuthHelper } from './auth/auth-helper';
import { DataFixtures } from './data/data-fixtures';
import { DataGenerator } from './data/data-generator';
import { IdUniqueness } from './data/id-uniqueness';
import { PlazaHelper } from './domain/plaza-helper';
import { ReservaHelper } from './domain/reserva-helper';
import { VehiculoHelper } from './domain/vehiculo-helper';
import { HttpClient } from './http/http-client';
import { CleanupHelper } from './infra/cleanup-helper';
import { logStepV3 } from './log/log-util';

// Auth
export { AuthHelper } from './auth/auth-helper';
export type { AuthenticatedUser } from './auth/auth-helper';

// Data
export { DataFixtures } from './data/data-fixtures';
export { DataGenerator } from './data/data-generator';
export { IdUniqueness } from './data/id-uniqueness';
export type { PlazaOptions, VehiculoOptions, ReservaOptions } from './data/data-fixtures';

// HTTP
export { HttpClient } from './http/http-client';

// Domain Helpers
export { PlazaHelper } from './domain/plaza-helper';
export { VehiculoHelper } from './domain/vehiculo-helper';
export { ReservaHelper } from './domain/reserva-helper';

// Infrastructure
export { CleanupHelper } from './infra/cleanup-helper';

// Logging
export { 
  logStepV3, 
  logPerformance, 
  logStateTransition, 
  logHttpRequest, 
  logCleanupOperation, 
  logUniquenessDebug 
} from './log/log-util';
export type { LogOptions } from './log/log-util';

// Convenience re-exports for common patterns
export const TestHelpers = {
  Auth: AuthHelper,
  Data: DataFixtures,
  Generator: DataGenerator,
  Uniqueness: IdUniqueness,
  Http: HttpClient,
  Plaza: PlazaHelper,
  Vehiculo: VehiculoHelper,
  Reserva: ReservaHelper,
  Cleanup: CleanupHelper,
  Log: logStepV3
} as const;

// Type helpers for better DX
export type TestContext = {
  app: any;
  authHelper: AuthHelper;
  dataFixtures: DataFixtures;
  httpClient: HttpClient;
};

export type CreateEntityResult<T = any> = {
  success: boolean;
  data?: T;
  error?: any;
};

/**
 * NUEVO: Factory para crear contexto de test unificado
 */
export function createTestContext(app: any): TestContext {
  return {
    app,
    authHelper: new AuthHelper(app),
    dataFixtures: new DataFixtures(app),
    httpClient: new HttpClient(app)
  };
}

/**
 * NUEVO: Utility para limpiar estado entre tests
 */
export async function resetTestState(): Promise<void> {
  // Limpiar generadores de IDs únicos
  IdUniqueness.clearAll();
  DataGenerator.clearStaticState();
  
  logStepV3('🔄 Estado de test reseteado', { 
    etiqueta: 'TEST_UTIL', 
    tipo: 'info' 
  });
}

/**
 * NUEVO: Obtener conteos de tablas principales para validación
 */
async function getTableCounts(app: any): Promise<{
  plazas: number;
  vehiculos: number;
  reservas: number;
}> {
  try {
    const dataSource = app.get(DataSource);
    
    const [plazasResult, vehiculosResult, reservasResult] = await Promise.all([
      dataSource.query('SELECT COUNT(*) as count FROM plazas;'),
      dataSource.query('SELECT COUNT(*) as count FROM vehiculos;'),
      dataSource.query('SELECT COUNT(*) as count FROM reservas;')
    ]);

    return {
      plazas: parseInt(plazasResult[0]?.count || '0'),
      vehiculos: parseInt(vehiculosResult[0]?.count || '0'),
      reservas: parseInt(reservasResult[0]?.count || '0')
    };
  } catch (error: any) {
    logStepV3('❌ Error obteniendo conteos de tablas', { 
      etiqueta: 'TEST_UTIL', 
      tipo: 'error' 
    }, error.message);
    
    // Fallback: devolver ceros si hay error
    return { plazas: 0, vehiculos: 0, reservas: 0 };
  }
}

/**
 * NUEVO: Utility para validar estado limpio de DB
 */
export async function validateCleanDatabase(app: any): Promise<boolean> {
  try {
    const counts = await getTableCounts(app);
    const isEmpty = counts.plazas === 0 && 
                   counts.vehiculos === 0 && 
                   counts.reservas === 0;
    
    if (!isEmpty) {
      logStepV3('⚠️ Base de datos no está limpia', { 
        etiqueta: 'TEST_UTIL', 
        tipo: 'warning' 
      }, counts);
    }
    
    return isEmpty;
  } catch (error: any) {
    logStepV3('❌ Error validando estado de BD', { 
      etiqueta: 'TEST_UTIL', 
      tipo: 'error' 
    }, error.message);
    return false;
  }
}
