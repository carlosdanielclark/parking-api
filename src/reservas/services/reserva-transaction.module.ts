import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservaTransactionService } from './reserva-transaction.service';
import { Reserva } from '../../entities/reserva.entity';
import { Plaza } from '../../entities/plaza.entity';
import { User } from '../../entities/user.entity';
import { Vehiculo } from '../../entities/vehiculo.entity';
import { LoggingModule } from '../../logging/logging.module';

/**
 * Módulo específico para transacciones de reservas
 * Incluye todas las entidades y servicios necesarios para operaciones transaccionales
 */
@Module({
  imports: [
    // Importar todas las entidades requeridas por ReservaTransactionService
    TypeOrmModule.forFeature([
      Reserva,   // Entidad principal para crear reservas
      Plaza,     // Para verificar disponibilidad y actualizar estado
      User,      // Para validar usuarios propietarios
      Vehiculo   // Para validar vehículos del usuario
    ]),
    // Importar LoggingModule para acceso a LoggingService
    LoggingModule,
  ],
  providers: [ReservaTransactionService],
  exports: [ReservaTransactionService],
})
export class ReservaTransactionModule {}
