// test/helpers/db-utils.ts
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import { DataSource } from 'typeorm';

export async function truncateTables(app: INestApplication, tables: string[]): Promise<void> {
  const dataSource = app.get(DataSource); // O usa get(DataSource) si tienes import type
  // Desactivar restricciones de FK temporalmente
  await dataSource.query('SET session_replication_role = replica;');
  // Truncar todas las tablas (incluye CASCADE y reinicio de identidad)
  await dataSource.query(`TRUNCATE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
  // Reactivar restricciones de FK
  await dataSource.query('SET session_replication_role = DEFAULT;');
}

/**
 * Elimina todos los documentos de la colección 'logs' usando la conexión Mongoose.
 * @param connection Instancia de Mongoose Connection (inyectada en setup global).
 */
export async function cleanMongoLogs(connection: Connection): Promise<void> {
  await connection.collection('logs').deleteMany({});
  // Opcional: también puedes validar que la colección está vacía si deseas assert en los tests
  const total = await connection.collection('logs').countDocuments();
  if (total !== 0) throw new Error('La colección logs no se limpió correctamente');
}