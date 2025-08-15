import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
        autoLoadEntities: true,
        synchronize: true, // Solo para desarrollo
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
