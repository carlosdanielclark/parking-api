import { config as dotenv } from 'dotenv';
import { DataSource } from 'typeorm';
import mongoose, { Connection as MongoConnection } from 'mongoose';

// Carga variables desde .env.test solo si está en test
dotenv({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

let pgDataSource: DataSource | null = null;
let mongoConnection: MongoConnection | null = null;

// PostgreSQL
async function connectPostgres() {
  if (pgDataSource && pgDataSource.isInitialized) return pgDataSource;
  console.log('🗄️ [PostgreSQL] Conectando a la base de datos...');
  pgDataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    // Puedes agregar entities o synchronize: false aquí si lo requieres
  });
  await pgDataSource.initialize();
  console.log('✅ [PostgreSQL] Conectado');
  return pgDataSource;
}

async function cleanPostgres() {
  const ds = await connectPostgres();
  const tables = ['reservas', 'vehiculos', 'usuarios', 'plazas']; // Ajusta según tu modelo
  console.log('⚡ [PostgreSQL] Limpiando tablas...');
  for (const table of tables) {
    await ds.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
  }
  console.log('🎉 [PostgreSQL] Tablas limpias');
}

// MongoDB
async function connectMongo() {
  if (mongoConnection && mongoConnection.readyState === 1) return mongoConnection;
  console.log('🍃 [MongoDB] Conectando a la base de datos...');
  // Revisar ruta a mongodb
  if(process.env.MONGODB_URI == undefined){
    console.log('❌ [INFO] Attempting connection to MongoDB:', process.env.MONGODB_URI);
  }else{
    console.log('✅ [INFO] Attempting connection to MongoDB:', process.env.MONGODB_URI);
  }  
  await mongoose.connect(process.env.MONGODB_URI || '', {
    dbName: process.env.MONGODB_DATABASE,
  });
  mongoConnection = mongoose.connection;
  mongoConnection.on('error', err => console.error('❌ [MongoDB] Error:', err));
  console.log('✅ [MongoDB] Conectado');
  return mongoConnection;
}

async function cleanMongo() {
  const conn = await connectMongo();
  if (!conn.db) {
    console.warn('⚠️ [MongoDB] cleanMongo: conn.db no está disponible.');
    return;
  }
  console.log('⚡ [MongoDB] Limpiando colecciones...');
  const collections = await conn.db.collections();
  for (const col of collections) {
    await col.deleteMany({});
  }
  console.log('🎉 [MongoDB] Colecciones limpias');
}


// Jest Hooks
export default async function globalSetup() {
  console.log('\n🚦 [E2E] Configuración global en ejecución...');
  await connectPostgres();
  await connectMongo();
  console.log('🚦 [E2E] Entorno listo, ejecutando pruebas...');
}

// Limpieza global al terminar
export async function teardown() {
  console.log('🧹 [E2E] Cerrando conexiones y limpiando entorno...');
  if (pgDataSource && pgDataSource.isInitialized) {
    await pgDataSource.destroy();
    console.log('🛑 [PostgreSQL] Desconectado');
  }
  if (mongoConnection && mongoConnection.readyState === 1) {
    await mongoConnection.close();
    console.log('🛑 [MongoDB] Desconectado');
  }
  console.log('✅ [E2E] Limpieza global completa | Listo para salir');
}

// Limpieza antes de cada suite, recomendado en setupFilesAfterEnv
export async function setupTestSuite() {
  console.log('\n🔄 [E2E] Limpiando datos previos al suite de test...');
  await cleanPostgres();
  await cleanMongo();
  console.log('🔄 [E2E] Datos limpios | Test suite listo 🚀');
}

// (Opcional) Limpieza entre tests individuales – puedes dejarlo vacío o añadir lógica si es necesario
export async function setupTest() {
  // Puedes usar esto para limpieza entre tests individuales si tienes side effects extra
}
