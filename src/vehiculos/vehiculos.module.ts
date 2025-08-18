// src/vehiculos/vehiculos.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehiculosService } from './vehiculos.service';
import { VehiculosController } from './vehiculos.controller';
import { Vehiculo } from '../entities/vehiculo.entity';
import { User } from '../entities/user.entity';

/**
 * Módulo de gestión de vehículos
 * Configura las dependencias necesarias para el CRUD de vehículos
 * Incluye entidad User para validaciones de propiedad
 */
@Module({
  imports: [
    // Registra las entidades necesarias para el funcionamiento del módulo
    TypeOrmModule.forFeature([
      Vehiculo, // Entidad principal del módulo
      User      // Entidad necesaria para validar propietarios
    ])
  ],
  controllers: [VehiculosController],
  providers: [VehiculosService],
  exports: [
    VehiculosService, // Exporta el servicio para uso en el módulo de reservas
    TypeOrmModule     // Exporta el módulo TypeORM para compartir repositorios
  ],
})
export class VehiculosModule {}
