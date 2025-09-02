import { config } from 'dotenv';
import { join } from 'path';

// Cargar variables de entorno de test
config({ path: join(__dirname, '..', '.env.test') });

console.log('🚦 [E2E] Configuración global en ejecución...');
console.log('📝 MONGO_URI:', process.env.MONGO_URI);

jest.setTimeout(120000);

beforeAll(async () => {
  console.log('🗄️ [PostgreSQL] Verificando conexión...');
  
  const requiredEnvVars = [
    'POSTGRES_HOST',
    'POSTGRES_USERNAME', 
    'POSTGRES_PASSWORD',
    'POSTGRES_DATABASE',
    'JWT_SECRET'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
  }

  console.log('✅ [PostgreSQL] Variables verificadas');
  console.log('✅ [MongoDB] URI configurada:', process.env.MONGO_URI);
});

afterAll(async () => {
  console.log('🚦 [E2E] Limpieza final completada');
});