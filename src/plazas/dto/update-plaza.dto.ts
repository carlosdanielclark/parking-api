// src/plazas/dto/update-plaza.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreatePlazaDto } from './create-plaza.dto';
import { EstadoPlaza } from '../../entities/plaza.entity';

/**
 * DTO para la actualización de plazas existentes
 * Permite actualización parcial, todos los campos son opcionales
 * Utilizado para cambios de estado, mantenimiento o reconfiguración
 */
export class UpdatePlazaDto extends PartialType(CreatePlazaDto) {}

