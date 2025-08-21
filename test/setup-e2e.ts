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
    try {
      console.log('Starting MongoMemoryServer...');
      this.mongoServer = await MongoMemoryServer.create();
      console.log('MongoMemoryServer started at', this.mongoServer.getUri());

      // Set environment variables carefully before app init
      process.env.NODE_ENV = 'test';
      process.env.MONGODB_URI = this.mongoServer.getUri();
      process.env.POSTGRES_DATABASE = 'parking_test';
      process.env.JWT_SECRET = 'test_jwt_secret_key_123';

      console.log('Creating Nest testing module...');
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      this.app = moduleFixture.createNestApplication();
      
      this.app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }));

      console.log('Initializing Nest application...');
      await this.app.init();
      console.log('Nest application initialized');

      return this.app;
    } catch (error) {
      console.error('Error during setupTestEnvironment:', error);
      throw error;
    }
}

  static async teardownTestEnvironment(): Promise<void> {
    try {
      console.log('Closing Nest application...');
      if (this.app) await this.app.close();
      console.log('Nest application closed');

      console.log('Stopping MongoMemoryServer...');
      if (this.mongoServer) await this.mongoServer.stop();
      console.log('MongoMemoryServer stopped');
    } catch (error) {
      console.error('Error during teardownTestEnvironment:', error);
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
}, 300000);

afterAll(async () => {
  await E2ETestSetup.teardownTestEnvironment();
}, 30000);

beforeEach(async () => {
  await E2ETestSetup.cleanDatabase();
});