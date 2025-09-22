// src/users/users.controller.ts

import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  Query, 
  HttpCode, 
  HttpStatus,
  Logger 
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import * as getUserDecorator from '../auth/decorators/get-user.decorator';
import { UserRole } from '../entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Controlador para la gestión de usuarios
 * Implementa endpoints REST para operaciones CRUD de usuarios
 * Aplica autorización basada en roles para cada endpoint
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Crear un nuevo usuario
   * Endpoint: POST /users
   * Acceso: Solo administradores
   * 
   * @param createUserDto - Datos del usuario a crear
   * @returns Usuario creado con mensaje de éxito
   */
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createUserDto: CreateUserDto) {
    this.logger.log(`Solicitud de creación de usuario: ${createUserDto.email} (${createUserDto.role})`);
    
    try {
      const user = await this.usersService.create(createUserDto);
      
      this.logger.log(`Usuario creado exitosamente: ${user.email}`);
      
      return {
        success: true,
        message: 'Usuario creado exitosamente',
        data: user,
      };
    } catch (error) {
      this.logger.error(`Error al crear usuario: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener todos los usuarios o filtrar por rol
   * Endpoint: GET /users?role=admin
   * Acceso: Administradores y empleados
   * 
   * @param role - Rol opcional para filtrar usuarios
   * @returns Lista de usuarios
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async findAll(@Query('role') role?: UserRole) {
    this.logger.log(`Solicitud de listado de usuarios${role ? ` con rol: ${role}` : ''}`);
    
    try {
      let users;
      if (role) {
        users = await this.usersService.findByRole(role);
        this.logger.log(`Se obtuvieron ${users.length} usuarios con rol ${role}`);
      } else {
        users = await this.usersService.findAll();
        this.logger.log(`Se obtuvieron ${users.length} usuarios en total`);
      }

      return {
        success: true,
        message: role 
          ? `Usuarios con rol ${role} obtenidos exitosamente` 
          : 'Usuarios obtenidos exitosamente',
        data: users,
        count: users.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener usuarios: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de usuarios
   * Endpoint: GET /users/stats
   * Acceso: Solo administradores
   * 
   * @returns Estadísticas de distribución de usuarios por rol
   */
  @Get('stats')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getUserStats() {
    this.logger.log('Solicitud de estadísticas de usuarios');
    
    try {
      const stats = await this.usersService.getUserStats();
      
      this.logger.log(`Estadísticas obtenidas: ${JSON.stringify(stats)}`);
      
      return {
        success: true,
        message: 'Estadísticas de usuarios obtenidas exitosamente',
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Error al obtener estadísticas: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener un usuario específico por ID
   * Endpoint: GET /users/:id
   * Acceso: Administradores y empleados
   * 
   * @param id - ID del usuario a buscar
   * @returns Usuario encontrado
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string) {
    this.logger.log(`Solicitud de usuario específico: ${id}`);
    
    try {
      const user = await this.usersService.findOne(id);
      
      this.logger.log(`Usuario encontrado: ${user.email}`);
      
      return {
        success: true,
        message: 'Usuario obtenido exitosamente',
        data: user,
      };
    } catch (error) {
      this.logger.error(`Error al obtener usuario ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Actualizar un usuario existente
   * Endpoint: PATCH /users/:id
   * Acceso: El propio usuario puede actualizar su perfil (excepto rol)
   *         Los administradores pueden actualizar cualquier usuario
   * 
   * @param id - ID del usuario a actualizar
   * @param updateUserDto - Datos a actualizar
   * @param currentUser - Usuario autenticado que realiza la operación
   * @returns Usuario actualizado
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string, 
    @Body() updateUserDto: UpdateUserDto,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser,
  ) {
    this.logger.log(`Solicitud de actualización de usuario ${id} por ${currentUser.userId} (${currentUser.role})`);
    
    try {
      const user = await this.usersService.update(id, updateUserDto, currentUser);
      
      this.logger.log(`Usuario actualizado exitosamente: ${user.email}`);
      
      return {
        success: true,
        message: 'Usuario actualizado exitosamente',
        data: user,
      };
    } catch (error) {
      this.logger.error(`Error al actualizar usuario ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Eliminar un usuario
   * Endpoint: DELETE /users/:id
   * Acceso: Solo administradores
   * 
   * @param id - ID del usuario a eliminar
   * @returns Confirmación de eliminación
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    this.logger.log(`Solicitud de eliminación de usuario: ${id}`);
    
    try {
      await this.usersService.remove(id);
      
      this.logger.log(`Usuario eliminado exitosamente: ${id}`);
      
      return {
        success: true,
        message: 'Usuario eliminado exitosamente',
      };
    } catch (error) {
      this.logger.error(`Error al eliminar usuario ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
