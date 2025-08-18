// src/users/users.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../entities/user.entity';

/**
 * Módulo de gestión de usuarios
 * Configura las dependencias necesarias para el CRUD de usuarios
 * Exporta el servicio para uso en otros módulos
 */
@Module({
  imports: [
    // Registra la entidad User para uso con TypeORM
    TypeOrmModule.forFeature([User])
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [
    UsersService, // Exporta el servicio para uso en otros módulos (ej: auth)
    TypeOrmModule // Exporta el módulo TypeORM para compartir el repositorio
  ],
})
export class UsersModule {}
