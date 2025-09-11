import { Module/*, MiddlewareConsumer */} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Controladores
import { AdminLogsController } from './controllers/admin-logs.controller';

// Servicios
import { LogsQueryService } from './services/logs-query.service';
import { LogsExportService } from './services/logs-export.service';

// Esquemas y entidades
import { Log, LogSchema } from '../schemas/log.schema';
import { LoggingModule } from '../logging/logging.module';

// Middlewares
import { AuditMiddleware } from './middleware/audit-middleware';

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
export class AdminModule {
    /*configure(consumer: MiddlewareConsumer) {
    // EDITADO: aplicar middleware solo a rutas admin/logs
    consumer.apply(AuditMiddleware).forRoutes('admin/logs');
  }*/
}