import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import { Plaza } from '../entities/plaza.entity';
import { Vehiculo } from '../entities/vehiculo.entity';
import { Reserva } from '../entities/reserva.entity';
import { FixPlazaUniqueConstraint1724857957000 } from '../migration/FixPlazaUniqueConstraint';
/**
 * Configuración de DataSource para migraciones de TypeORM
 * Utiliza variables de entorno para conexión
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  username: process.env.POSTGRES_USERNAME || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'admin',
  database: process.env.POSTGRES_DATABASE || 'parking_db',
  
  entities: [User, Plaza, Vehiculo, Reserva],
  migrations: [FixPlazaUniqueConstraint1724857957000],
  
  // Configuración para desarrollo
  synchronize: false, // ¡NUNCA true con migraciones!
  logging: ['error', 'migration'],
  
  // Configuración del pool
  extra: {
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
  },
});
