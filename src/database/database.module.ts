// src/database/database.module.ts
import { Module, Global } from '@nestjs/common';
import { DataSource } from 'typeorm';

// El provider DataSource se inicializa desde el contexto global de TypeORM
export const dataSourceProvider = {
    provide: DataSource,
    useFactory: async () => {
    // Obtener la instancia existente de TypeORM
    try {
      // Intenta obtener el DataSource predeterminado
      const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT),
        username: process.env.POSTGRES_USERNAME,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DATABASE,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: true,
      });
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }
      return dataSource;
    } catch (error) {
      throw new Error(`No se pudo inicializar DataSource: ${error.message}`);
    }

    },
};

@Global()
@Module({
  providers: [dataSourceProvider],
  exports: [dataSourceProvider],
})
export class DatabaseModule {}
