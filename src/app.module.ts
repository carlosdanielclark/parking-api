import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Importaciones de entidades
import { User } from './entities/user.entity';
import { Plaza } from './entities/plaza.entity';
import { Vehiculo } from './entities/vehiculo.entity';
import { Reserva } from './entities/reserva.entity';
// Importa esquemas de log
import { Log, LogSchema } from './schemas/log.schema';
import { DatabaseTestService } from './database/database-test.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.postgres.host'),
        port: configService.get('database.postgres.port'),
        username: configService.get('database.postgres.username'),
        password: configService.get('database.postgres.password'),
        database: configService.get('database.postgres.database'),
        entities: [User, Plaza, Vehiculo, Reserva], // Entidades añadidas
        synchronize: true, // Solo para desarrollo
        logging: ['error'], // ['error', 'warn'] o true,
        // Configuración de pool de conexiones
        extra: {
          connectionLimit: 10,
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const host = configService.get('database.mongo.host');
        const port = configService.get('database.mongo.port');
        const database = configService.get('database.mongo.database');
        // Otros módulos aquí
        return {
          uri: `mongodb://${host}:${port}/${database}`,
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: Log.name, schema: LogSchema }]), // Modelo añadido
  ],
  controllers: [AppController],
  providers: [
    AppService, 
    DatabaseTestService, // Servicio añadido
  ],
})
export class AppModule {}
