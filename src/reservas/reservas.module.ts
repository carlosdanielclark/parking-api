// src/reservas/reservas.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservasService } from './reservas.service';
import { ReservasController } from './reservas.controller';
import { Reserva } from '../entities/reserva.entity';
import { Plaza } from '../entities/plaza.entity';
import { User } from '../entities/user.entity';
import { Vehiculo } from '../entities/vehiculo.entity';
import { ReservaTransactionModule } from './services/reserva-transaction.module';
import { LoggingModule } from '../logging/logging.module';

/**
 * Módulo de gestión de reservas de parking
 * Configura las dependencias para el CRUD de reservas
 * Incluye todas las entidades relacionadas para validaciones cruzadas
 */
@Module({
  imports: [
    // Registra todas las entidades necesarias para las operaciones de reservas
    TypeOrmModule.forFeature([
      Reserva,  // Entidad principal del módulo
      Plaza,    // Necesaria para validar disponibilidad y actualizar estados
      User,     // Necesaria para validar propietarios de reservas
      Vehiculo  // Necesaria para validar propiedad de vehículos
    ]),
    ReservaTransactionModule,
    LoggingModule,
  ],
  controllers: [ReservasController],
  providers: [ReservasService],
  exports: [
    ReservasService, // Exporta el servicio para uso en otros módulos si es necesario
    TypeOrmModule    // Exporta el módulo TypeORM para compartir repositorios
  ],
})
export class ReservasModule {}
