import { MongoMemoryServer } from 'mongodb-memory-server';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { getConnectionToken } from '@nestjs/typeorm';
import { getConnectionToken as getMongoConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'typeorm';
import { Connection as MongoConnection } from 'mongoose';

export class E2ETestSetup {
  static mongoServer: MongoMemoryServer;
  static app: INestApplication;

  static async setupTestEnvironment(): Promise<INestApplication> {
    // Configurar MongoDB en memoria
    this.mongoServer = await MongoMemoryServer.create();
    const mongoUri = this.mongoServer.getUri();
    
    // Configurar variables de entorno de prueba
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoUri;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/parking_test';
    process.env.JWT_SECRET = 'test_jwt_secret_key_123';
    process.env.JWT_EXPIRATION_TIME = '3600';
    
    // Crear módulo de testing
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    this.app = moduleFixture.createNestApplication();
    
    // Configurar pipes globales
    this.app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    
    await this.app.init();
    return this.app;
  }

  static async teardownTestEnvironment(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }
  }

  static async cleanDatabase(): Promise<void> {
    try {
      // Limpiar PostgreSQL
      const pgConnection = this.app.get<Connection>(getConnectionToken());
      if (pgConnection) {
        const entities = pgConnection.entityMetadatas;
        for (const entity of entities) {
          const repository = pgConnection.getRepository(entity.name);
          await repository.query(`TRUNCATE TABLE "${entity.tableName}" RESTART IDENTITY CASCADE;`);
        }
      }
      
      // Limpiar MongoDB
      const mongoConnection = this.app.get<MongoConnection>(getMongoConnectionToken());
      if (mongoConnection && mongoConnection.db) {
        const collections = await mongoConnection.db.collections();
        for (const collection of collections) {
          await collection.deleteMany({});
        }
      }
    } catch (error) {
      console.warn('Error al limpiar base de datos:', error.message);
    }
  }
}

// Configuración global para todas las pruebas e2e
beforeAll(async () => {
  await E2ETestSetup.setupTestEnvironment();
}, 60000);

afterAll(async () => {
  await E2ETestSetup.teardownTestEnvironment();
}, 30000);

beforeEach(async () => {
  await E2ETestSetup.cleanDatabase();
});