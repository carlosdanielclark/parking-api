// src/plazas/plazas.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlazasService } from './plazas.service';
import { PlazasController } from './plazas.controller';
import { Plaza } from '../entities/plaza.entity';

/**
 * Módulo de gestión de plazas de parking
 * Configura las dependencias necesarias para el CRUD de plazas
 * Exporta el servicio para uso en otros módulos (especialmente reservas)
 */
@Module({
  imports: [
    // Registra la entidad Plaza para uso con TypeORM
    TypeOrmModule.forFeature([Plaza])
  ],
  controllers: [PlazasController],
  providers: [PlazasService],
  exports: [
    PlazasService, // Exporta el servicio para uso en el módulo de reservas
    TypeOrmModule  // Exporta el módulo TypeORM para compartir el repositorio
  ],
})
export class PlazasModule {}
