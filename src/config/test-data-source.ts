// src/test-data-source.ts
import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import { Plaza } from '../entities/plaza.entity';
import { Vehiculo } from '../entities/vehiculo.entity';
import { Reserva } from '../entities/reserva.entity';
import { InitParkingDbSchema1693600000000 } from '../migrations/InitParkingDbSchema';

/**
 * DataSource específico para testing
 * Usa la base de datos de pruebas con puerto 5433
 */
export const TestDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'), // Puerto 5433 para tests
  username: process.env.POSTGRES_USERNAME || 'test_user',
  password: process.env.POSTGRES_PASSWORD || 'test_password',
  database: process.env.POSTGRES_DATABASE || 'parking_test_db',
  
  entities: [User, Plaza, Vehiculo, Reserva],
  migrations: [InitParkingDbSchema1693600000000],
  
  // Configuración específica para testing
  synchronize: false, // Usar migraciones, no synchronize
  logging: process.env.NODE_ENV === 'test' ? ['error'] : ['error', 'migration'],
  dropSchema: false, // No dropear schema automáticamente
  migrationsRun: true, // Ejecutar migraciones automáticamente
  
  // Pool configuration optimizada para tests
  extra: {
    connectionLimit: 5, // Menos conexiones para tests
    acquireTimeout: 30000,
    timeout: 30000,
  },
  
  // Opciones específicas de TypeORM
  migrationsTableName: 'migrations_test', // Tabla separada para migraciones de test
});