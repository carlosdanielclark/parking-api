// test/setup-e2e.ts
import { config } from 'dotenv';
import { join } from 'path';
import { Client } from 'pg';

// Cargar variables de entorno de test
config({ path: join(__dirname, '..', '.env.test') });

console.log('🚦 [E2E] Configuración global en ejecución...');
console.log('📝 MONGO_URI:', process.env.MONGO_URI);

jest.setTimeout(120000);

async function sanitizePlazas() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: +(process.env.POSTGRES_PORT || 5433),
    user: process.env.POSTGRES_USERNAME || 'test_user',
    password: process.env.POSTGRES_PASSWORD || 'test_password',
    database: process.env.POSTGRES_DATABASE || 'parking_test_db',
  });

  await client.connect();

  try {
    await client.query('BEGIN');
    // Solo ejecutar si la tabla existe (evita errores en db recién creada)
    await client.query(`DO $$ BEGIN IF EXISTS ( SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plazas' ) THEN DELETE FROM public.plazas WHERE numero_plaza IS NULL; END IF; END$$;`);
    await client.query('COMMIT');
    console.log('🧹 [PostgreSQL] Saneadas filas inválidas en "plazas" (NULLs eliminados)');
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('🔴 [PostgreSQL] Error durante sanitizePlazas:', e?.message || e);
    throw e;
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
console.log('🗄️ [PostgreSQL] Verificando conexión...');

const requiredEnvVars = [
'POSTGRES_HOST',
'POSTGRES_USERNAME',
'POSTGRES_PASSWORD',
'POSTGRES_DATABASE',
'JWT_SECRET'
];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
throw new Error(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
}

await sanitizePlazas();
console.log('✅ [PostgreSQL] Variables verificadas');
console.log('✅ [MongoDB] URI configurada:', process.env.MONGO_URI);
});

afterAll(async () => {
console.log('🚦 [E2E] Limpieza final completada');
});

