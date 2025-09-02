import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
  console.log('🚀 [E2E] Setup global iniciado');
  
  // Iniciar servidor MongoDB en memoria
  const mongod = await MongoMemoryServer.create({
  instance: {
    port: 27018,
    dbName: 'parking_logs_test',
    ip: '127.0.0.1', // Especificar IP para Windows
  },
    binary: {
      version: '6.0.0',
    },
  });

  // Establecer variables de entorno
  const mongoUri = mongod.getUri();
  process.env.MONGO_URL = mongoUri;
  process.env.MONGO_URI = mongoUri;
  
  console.log(`✅ [MongoDB] Servidor iniciado: ${mongoUri}`);
  console.log('✅ [E2E] Setup global completado');

  // Guardar instancia para cerrarla later
  (global as any).__MONGOD__ = mongod;
}