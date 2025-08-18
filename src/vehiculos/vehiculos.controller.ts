// src/vehiculos/vehiculos.controller.ts

import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  HttpCode, 
  HttpStatus,
  Logger 
} from '@nestjs/common';
import { VehiculosService } from './vehiculos.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import * as getUserDecorator from '../auth/decorators/get-user.decorator';
import { UserRole } from '../entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Controlador para la gestión de vehículos
 * Implementa endpoints REST para operaciones CRUD de vehículos
 * Aplica autorización basada en propiedad y roles
 */
@Controller('vehiculos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiculosController {
  private readonly logger = new Logger(VehiculosController.name);

  constructor(private readonly vehiculosService: VehiculosService) {}

  /**
   * Crear un nuevo vehículo
   * Endpoint: POST /vehiculos
   * Acceso: El propietario del vehículo o administradores
   * 
   * @param createVehiculoDto - Datos del vehículo a crear
   * @param currentUser - Usuario autenticado
   * @returns Vehículo creado con mensaje de éxito
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createVehiculoDto: CreateVehiculoDto,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de creación de vehículo: ${createVehiculoDto.placa} por ${currentUser.userId}`);
    
    try {
      const vehiculo = await this.vehiculosService.create(createVehiculoDto, currentUser);
      
      this.logger.log(`Vehículo creado exitosamente: ${vehiculo.placa}`);
      
      return {
        success: true,
        message: 'Vehículo registrado exitosamente',
        data: vehiculo,
      };
    } catch (error) {
      this.logger.error(`Error al crear vehículo: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener todos los vehículos según permisos del usuario
   * Endpoint: GET /vehiculos
   * Acceso: Todos los usuarios autenticados
   * - Administradores y empleados: ven todos los vehículos
   * - Clientes: solo ven sus propios vehículos
   * 
   * @param currentUser - Usuario autenticado
   * @returns Lista de vehículos según permisos
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser) {
    this.logger.log(`Solicitud de listado de vehículos por ${currentUser.userId} (${currentUser.role})`);
    
    try {
      const vehiculos = await this.vehiculosService.findAll(currentUser);
      
      this.logger.log(`Se obtuvieron ${vehiculos.length} vehículos para el usuario`);
      
      return {
        success: true,
        message: 'Vehículos obtenidos exitosamente',
        data: vehiculos,
        count: vehiculos.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener vehículos: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener vehículos de un usuario específico
   * Endpoint: GET /vehiculos/usuario/:usuarioId
   * Acceso: El propio usuario, empleados y administradores
   * 
   * @param usuarioId - ID del usuario propietario
   * @param currentUser - Usuario autenticado
   * @returns Lista de vehículos del usuario
   */
  @Get('usuario/:usuarioId')
  @HttpCode(HttpStatus.OK)
  async findByUsuario(
    @Param('usuarioId') usuarioId: string,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de vehículos del usuario ${usuarioId} por ${currentUser.userId}`);
    
    try {
      const vehiculos = await this.vehiculosService.findByUsuario(usuarioId, currentUser);
      
      this.logger.log(`Se encontraron ${vehiculos.length} vehículos para el usuario ${usuarioId}`);
      
      return {
        success: true,
        message: `Vehículos del usuario obtenidos exitosamente`,
        data: vehiculos,
        count: vehiculos.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener vehículos del usuario ${usuarioId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener un vehículo específico por ID
   * Endpoint: GET /vehiculos/:id
   * Acceso: El propietario del vehículo, empleados y administradores
   * 
   * @param id - ID del vehículo a buscar
   * @param currentUser - Usuario autenticado
   * @returns Vehículo encontrado con detalles completos
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id') id: string,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de vehículo específico: ${id} por ${currentUser.userId}`);
    
    try {
      const vehiculo = await this.vehiculosService.findOne(id, currentUser);
      
      this.logger.log(`Vehículo encontrado: ${vehiculo.placa}`);
      
      return {
        success: true,
        message: 'Vehículo obtenido exitosamente',
        data: vehiculo,
      };
    } catch (error) {
      this.logger.error(`Error al obtener vehículo ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Actualizar un vehículo existente
   * Endpoint: PATCH /vehiculos/:id
   * Acceso: El propietario del vehículo o administradores
   * 
   * @param id - ID del vehículo a actualizar
   * @param updateVehiculoDto - Datos a actualizar
   * @param currentUser - Usuario autenticado
   * @returns Vehículo actualizado
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() updateVehiculoDto: UpdateVehiculoDto,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de actualización de vehículo ${id} por ${currentUser.userId}`);
    
    try {
      const vehiculo = await this.vehiculosService.update(id, updateVehiculoDto, currentUser);
      
      this.logger.log(`Vehículo actualizado exitosamente: ${vehiculo.placa}`);
      
      return {
        success: true,
        message: 'Vehículo actualizado exitosamente',
        data: vehiculo,
      };
    } catch (error) {
      this.logger.error(`Error al actualizar vehículo ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Eliminar un vehículo
   * Endpoint: DELETE /vehiculos/:id
   * Acceso: El propietario del vehículo o administradores
   * 
   * @param id - ID del vehículo a eliminar
   * @param currentUser - Usuario autenticado
   * @returns Confirmación de eliminación
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de eliminación de vehículo ${id} por ${currentUser.userId}`);
    
    try {
      await this.vehiculosService.remove(id, currentUser);
      
      this.logger.log(`Vehículo eliminado exitosamente: ${id}`);
      
      return {
        success: true,
        message: 'Vehículo eliminado exitosamente',
      };
    } catch (error) {
      this.logger.error(`Error al eliminar vehículo ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
