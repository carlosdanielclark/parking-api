// src/plazas/plazas.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlazasService } from './plazas.service';
import { PlazasController } from './plazas.controller';
import { OcupacionController } from './controllers/ocupacion.controller';
import { OcupacionService } from './services/ocupacion.service';
import { Plaza } from '../entities/plaza.entity';
import { Reserva } from '../entities/reserva.entity';

/**
 * Módulo de gestión de plazas de parking
 * Configura las dependencias necesarias para el CRUD de plazas
 * Exporta el servicio para uso en otros módulos (especialmente reservas)
 */
@Module({
  imports: [
    // Registra la entidad Plaza para uso con TypeORM
    TypeOrmModule.forFeature([Plaza, Reserva])
  ],
  controllers: [PlazasController, OcupacionController],
  providers: [PlazasService, OcupacionService],
  exports: [
    PlazasService, // Exporta el servicio para uso en el módulo de reservas
    OcupacionService,
    TypeOrmModule,  // Exporta el módulo TypeORM para compartir el repositorio
  ],
})
export class PlazasModule {}
