import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

export default async function globalSetup() {
  console.log('🚀 [E2E] Setup global iniciado');
  
  // Iniciar servidor MongoDB en memoria
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27018,
      dbName: 'parking_logs_test',
      ip: '127.0.0.1', // IP para mayor compatibilidad en Windows
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

  // Conexión a la instancia de Mongo para eliminar la colección 'logs'
  await mongoose.connect(mongoUri, { dbName: 'parking_logs_test' });
  // Limpiar colección logs
  await mongoose.connection.collection('logs').deleteMany({});
  console.log('🧹 [MongoDB] Colección logs limpiada con éxito.');
  // Desconectar después de limpiar
  await mongoose.disconnect();

  console.log('✅ [E2E] Setup global completado');

  // Guardar instancia para cerrarla después
  (global as any).__MONGOD__ = mongod;
}
