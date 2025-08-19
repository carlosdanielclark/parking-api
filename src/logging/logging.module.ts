import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggingService } from './logging.service';
import { Log, LogSchema } from '../schemas/log.schema';

/**
 * Módulo de logging centralizado
 * Configura MongoDB para almacenamiento de logs
 * Exporta LoggingService para uso en otros módulos
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ 
      name: Log.name, 
      schema: LogSchema 
    }])
  ],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
