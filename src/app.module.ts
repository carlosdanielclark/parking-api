import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Importaciones de entidades TypeORM
import { User } from './entities/user.entity';
import { Plaza } from './entities/plaza.entity';
import { Vehiculo } from './entities/vehiculo.entity';
import { Reserva } from './entities/reserva.entity';

// Importaciones de esquemas MongoDB
import { Log, LogSchema } from './schemas/log.schema';

// Importaciones de servicios
import { DatabaseTestService } from './database/database-test-service';
import { SeedAdminService } from './database/seed-admin-service';

// Importaciones del módulo de autenticación
import { AuthModule } from './auth/auth.module';

// Importación de nuevos módulos CRUD
import { UsersModule } from './users/users.module';
import { PlazasModule } from './plazas/plazas.module';
import { VehiculosModule } from './vehiculos/vehiculos.module';
import { ReservasModule } from './reservas/reservas.module';
import { LogsModule } from './logs/logs.module';

// Importaciones de guards globales
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

/**
 * Módulo principal de la aplicación
 * Configura bases de datos, autenticación, guards globales y validación
 * Integra PostgreSQL para entidades de negocio y MongoDB para logging
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.local'],
      validationOptions: { allowUnknown: false, abortEarly: true },
    }),

    /**
     * Configuración asíncrona de TypeORM para PostgreSQL
     * Gestiona las entidades principales del negocio (usuarios, plazas, vehículos, reservas)
     */
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.postgres.host'),
        port: configService.get('database.postgres.port'),
        username: configService.get('database.postgres.username'),
        password: configService.get('database.postgres.password'),
        database: configService.get('database.postgres.database'),
        entities: [User, Plaza, Vehiculo, Reserva],
        synchronize: configService.get('nodeEnv') === 'development',
        logging: configService.get('nodeEnv') === 'development' ? ['error', 'warn'] : ['error'],
        
        // Configuración del pool de conexiones
        extra: {
          connectionLimit: 10,
          acquireTimeout: 60000,
          timeout: 60000,
        },

        // Configuración de timezone
        timezone: 'UTC',
      }),
      inject: [ConfigService],
    }),

    /**
     * Configuración asíncrona de Mongoose para MongoDB
     * Gestiona el sistema de logging y auditoría de la aplicación
     */
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const host = configService.get('database.mongo.host');
        const port = configService.get('database.mongo.port');
        const database = configService.get('database.mongo.database');
        if (!host || !port || !database) {
          throw new Error('MongoDB connection parameters are not properly configured');
        }

        // Construir URI sin usuario y password
        const uri = `mongodb://${host}:${port}/${database}`;
        return {
          uri,
          retryAttempts: 3,
          retryDelay: 1000,
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              console.log('✅ MongoDB conectado exitosamente');
            });
            connection.on('error', (error) => {
              console.error('❌ Error de conexión MongoDB:', error);
            });
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),

    /**
     * Registro de esquemas MongoDB
     * Configura el modelo Log para el sistema de auditoría
     */
    MongooseModule.forFeature([{ name: Log.name, schema: LogSchema }]),

    /**
     * Registro de entidades TypeORM para inyección de dependencias
     * Permite usar repositorios en servicios específicos
     */
    TypeOrmModule.forFeature([User, Plaza, Vehiculo, Reserva]),

    /**
     * Módulo de autenticación y autorización
     * Configura JWT, Passport y servicios de autenticación
     */
    AuthModule,
    UsersModule,
    PlazasModule,
    VehiculosModule,
    ReservasModule,
    LogsModule,
  ],

  /**
   * Controladores de la aplicación
   */
  controllers: [AppController],

  /**
   * Proveedores y configuraciones globales
   */
  providers: [
    AppService,
    DatabaseTestService,
    SeedAdminService,

    /**
     * Configuración de ValidationPipe global
     * Valida automáticamente DTOs en todos los endpoints
     */
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          // Transformar automáticamente los tipos de datos
          transform: true,
          // Remover propiedades no definidas en DTOs
          whitelist: true,
          // Rechazar requests con propiedades no permitidas
          forbidNonWhitelisted: true,
          // Validar arrays anidados
          validateCustomDecorators: true,
          // Personalizar mensajes de error
          errorHttpStatusCode: 422,
          // Parar en el primer error encontrado
          stopAtFirstError: true,
        }),
    },
    /**
     * Guard global de autenticación JWT
     * Protege todas las rutas excepto las marcadas con @Public()
     */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    /**
     * Guard global de autorización por roles
     * Verifica permisos basados en roles después de la autenticación
     */
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    this.logStartupInfo();
  }
  /**
   * Muestra información de configuración al iniciar la aplicación
   * Útil para debugging y verificación de entorno
   */
  private logStartupInfo() {
    const nodeEnv = this.configService.get('nodeEnv');
    const port = this.configService.get('port');
    const postgresHost = this.configService.get('database.postgres.host');
    const mongoHost = this.configService.get('database.mongo.host');

    console.log(`
      🚀 Parking API - Configuración de Inicio
      ════════════════════════════════════════
      📍 Entorno: ${nodeEnv}
      🌐 Puerto: ${port}
      🐘 PostgreSQL: ${postgresHost}
      🍃 MongoDB: ${mongoHost}
      🔐 Autenticación: JWT habilitado
      👥 Roles: Admin, Empleado, Cliente
      ════════════════════════════════════════
    `);
  }
}