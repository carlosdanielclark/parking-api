import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controladores
import { AdminLogsController } from './controllers/admin-logs.controller';

// Servicios
import { LogsQueryService } from './services/logs-query.service';
import { LogsExportService } from './services/logs-export.service';

// Servicios compartidos
import { LoggingService } from '../logging/logging.service';

// Esquemas y entidades
import { Log, LogSchema } from '../schemas/log.schema';


import { LoggingModule } from '../../src/logging/logging.module';

/**
 * Módulo administrativo para gestión de logs del sistema
 * Proporciona endpoints especializados para administradores
 * Incluye auditoría automática de todas las operaciones
 */
@Module({
  imports: [
    LoggingModule,
    // Registro de esquemas MongoDB para logs
    MongooseModule.forFeature([
      { name: Log.name, schema: LogSchema }
    ]),
    
  ],
  
  controllers: [
    AdminLogsController,
  ],
  
  providers: [LogsQueryService, LogsExportService],
  exports: [LogsQueryService, LogsExportService],
})
export class AdminModule {}