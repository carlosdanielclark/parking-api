// src/users/users.service.ts

import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { authConstants } from '../auth/constants';
import { LoggingService } from '../logging/logging.service';

/**
 * Servicio para la gestión completa de usuarios
 * Implementa operaciones CRUD con validaciones de negocio y seguridad
 * Maneja autorización basada en roles para diferentes operaciones
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly loggingService: LoggingService, //NEW LINE
  ) {}

  /**
   * Crea un nuevo usuario en el sistema
   * Solo accesible por administradores
   * Valida unicidad de email y encripta la contraseña
   * 
   * @param createUserDto - Datos del usuario a crear
   * @returns Usuario creado sin la contraseña
   * @throws BadRequestException si el email ya existe
   */
  async create(createUserDto: CreateUserDto): Promise<Partial<User>> {
    const { email, password, ...userData } = createUserDto;

    this.logger.log(`Creating user with email: ${email}`);

    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Duplicate email on create: ${email}`);
      throw new BadRequestException('Email is already registered');
    }

    try {
      const hashed = await bcrypt.hash(password, authConstants.saltRounds);
      const user = this.userRepository.create({ ...userData, email, password: hashed });

      const saved = await this.userRepository.save(user);

      this.logger.log(`User created: ${saved.id} (${saved.email}), role: ${saved.role}`);

      const { password: _, ...result } = saved;
      return result;
    } catch (e) {
      this.logger.error(`Error creating user ${email}: ${e.message}`, e.stack);
      throw new BadRequestException('Internal error creating user');
    }
  }

  /**
   * Obtiene todos los usuarios del sistema
   * Accesible por administradores y empleados
   * Excluye las contraseñas de la respuesta
   * 
   * @returns Lista de usuarios sin contraseñas
   */
  async findAll(): Promise<Partial<User>[]> {
    this.logger.log('Fetching all users');

    try {
      const users = await this.userRepository.find({ order: { created_at: 'DESC' } });
      this.logger.log(`Found ${users.length} users`);

      return users.map(u => {
        const { password, ...rest } = u;
        return rest;
      });
    } catch (e) {
      this.logger.error(`Error fetching users: ${e.message}`, e.stack);
      throw new BadRequestException('Internal error fetching users');
    }
  }


  /**
   * Obtiene un usuario específico por su ID
   * Accesible por administradores y empleados
   * 
   * @param id - ID del usuario a buscar
   * @returns Usuario encontrado sin contraseña
   * @throws NotFoundException si el usuario no existe
   */
  async findOne(id: string): Promise<Partial<User>> {
    this.logger.log(`Fetching user ${id}`);

    try {
      const user = await this.userRepository.findOne({
        where: { id },
        relations: ['vehiculos', 'reservas'],
      });

      if (!user) {
        this.logger.warn(`User not found: ${id}`);
        throw new NotFoundException(`User not found: ${id}`);
      }

      this.logger.log(`User found: ${user.email} (${user.role})`);

      const { password, ...result } = user;
      return result;
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      this.logger.error(`Error fetching user ${id}: ${e.message}`, e.stack);
      throw new BadRequestException('Internal error fetching user');
    }
  }

  /**
  * Busca un usuario por su email.
  * 
  * @param email - Email del usuario a buscar.
  * @returns El usuario encontrado o null si no existe.
  */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  /**
   * Actualiza un usuario existente
   * Los usuarios pueden actualizar su propio perfil (excepto rol)
   * Solo administradores pueden cambiar roles y actualizar otros usuarios
   * 
   * @param id - ID del usuario a actualizar
   * @param updateUserDto - Datos a actualizar
   * @param currentUser - Usuario que realiza la operación
   * @returns Usuario actualizado sin contraseña
   * @throws ForbiddenException si no tiene permisos
   * @throws NotFoundException si el usuario no existe
   * @throws BadRequestException si el email ya existe
   */
  async update(id: string, updateUserDto: UpdateUserDto, currentUser: any): Promise<Partial<User>> {
    this.logger.log(`Actualizando usuario ${id} por usuario ${currentUser.userId} (${currentUser.role})`);

    // Verificar permisos: solo admin puede actualizar cualquier usuario
    if (currentUser.role !== UserRole.ADMIN && currentUser.userId !== id) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó actualizar usuario ${id}`);
      throw new ForbiddenException('No tienes permisos para actualizar este usuario');
    }

    // Solo admin puede cambiar roles
    if (updateUserDto.role && currentUser.role !== UserRole.ADMIN) {
      this.logger.warn(`Intento no autorizado de cambio de rol por usuario ${currentUser.userId}`);
      throw new ForbiddenException('Solo los administradores pueden cambiar roles');
    }

    // Verificar que el usuario existe
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      this.logger.warn(`Intento de actualización de usuario inexistente: ${id}`);
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    // ✅ AGREGADO: Guardar estado anterior para logging
    const previousState = {
      nombre: user.nombre,
      email: user.email,
      telefono: user.telefono,
      role: user.role
    };

    try {
      // Encriptar nueva contraseña si se proporciona
      if (updateUserDto.password) {
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, authConstants.saltRounds);
        this.logger.log(`Contraseña actualizada para usuario ${id}`);
      }

      // Verificar email único si se cambia
      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingUser = await this.userRepository.findOne({ 
          where: { email: updateUserDto.email } 
        });
        if (existingUser) {
          this.logger.warn(`Intento de cambio a email duplicado: ${updateUserDto.email}`);
          throw new BadRequestException('El email ya está registrado por otro usuario');
        }
      }

      // ✅ CRÍTICO: Logging del cambio de rol ANTES de la actualización
      if (updateUserDto.role && updateUserDto.role !== user.role) {
        await this.loggingService.logRoleChange(
          currentUser.userId,
          user.id,
          user.role,
          updateUserDto.role
        );
      }

      // Actualizar usuario
      await this.userRepository.update(id, updateUserDto);
      const updatedUser = await this.userRepository.findOne({ where: { id } });
      
      if (!updatedUser) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado tras actualización`);
      }

      // ✅ AGREGADO: Logging de la actualización general
      const newState = {
        nombre: updatedUser.nombre,
        email: updatedUser.email,
        telefono: updatedUser.telefono,
        role: updatedUser.role
      };

      await this.loggingService.logUserUpdated(
        currentUser.userId,
        user.id,
        previousState,
        newState,
        'Actualización de perfil de usuario'
      );

      this.logger.log(`Usuario actualizado exitosamente: ${updatedUser.id} - ${updatedUser.email}`);

      // Retornar sin contraseña
      const { password: _, ...result } = updatedUser;
      return result;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error al actualizar usuario ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al actualizar usuario');
    }
  }

  /**
   * Elimina un usuario del sistema
   * Solo accesible por administradores
   * Elimina en cascada vehículos y reservas asociadas
   * 
   * @param id - ID del usuario a eliminar
   * @throws NotFoundException si el usuario no existe
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Eliminando usuario: ${id}`);

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      this.logger.warn(`Intento de eliminación de usuario inexistente: ${id}`);
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    try {
      await this.userRepository.remove(user);
      this.logger.log(`Usuario eliminado exitosamente: ${id} - ${user.email}`);
    } catch (error) {
      this.logger.error(`Error al eliminar usuario ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al eliminar usuario');
    }
  }

  /**
   * Obtiene usuarios filtrados por rol
   * Útil para consultas administrativas específicas
   * 
   * @param role - Rol por el cual filtrar
   * @returns Lista de usuarios con el rol especificado
   */
  async findByRole(role: UserRole): Promise<Partial<User>[]> {
    this.logger.log(`Find users by role: ${role}`);

    try {
      const users = await this.userRepository.find({
        where: { role },
        order: { created_at: 'DESC' },
      });
      return users.map(u => {
        const { password, ...rest } = u;
        return rest;
      });
    } catch (e) {
      this.logger.error(`Error finding users by role: ${e.message}`, e.stack);
      throw new BadRequestException('Internal error finding users');
    }
  }

  /**
   * Busca usuario por ID
   * @param userId - ID del usuario
   * @returns Usuario completo o null si no existe
   */
  async findById(userId: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'nombre', 'email', 'role', 'telefono'], // Excluir la password explícitamente
    });
    return user || null;
  }

  /**
   * Obtiene estadísticas de usuarios por rol
   * Útil para dashboards administrativos
   * 
   * @returns Estadísticas de distribución de usuarios
   */
  async getUserStats(): Promise<{total:number, admins:number, empleados:number, clientes:number}> {
    this.logger.log('Getting user stats');

    try {
      const total = await this.userRepository.count();
      const admins = await this.userRepository.count({ where: { role: UserRole.ADMIN } });
      const empleados = await this.userRepository.count({ where: { role: UserRole.EMPLEADO } });
      const clientes = await this.userRepository.count({ where: { role: UserRole.CLIENTE } });

      const result = { total, admins, empleados, clientes };
      this.logger.log(`User stats: ${JSON.stringify(result)}`);
      return result;
    } catch (e) {
      this.logger.error(`Error getting user stats: ${e.message}`, e.stack);
      throw new BadRequestException('Internal error getting user stats');
    }
  }
  
  async actualizarUsuario(id: string, updateDto: UpdateUserDto, adminUser: any) {
    // Obtener estado previo antes de cambios
    const usuarioPrevio = await this.userRepository.findOne({ where: { id } });
    if (!usuarioPrevio) {
      throw new BadRequestException('Usuario no encontrado');
    }
    const previousUserState = {
      nombre: usuarioPrevio.nombre,
      email: usuarioPrevio.email,
      telefono: usuarioPrevio.telefono,
      role: usuarioPrevio.role,
    };
    // Aplicar cambios
    Object.assign(usuarioPrevio, updateDto);
    const usuarioActualizado = await this.userRepository.save(usuarioPrevio);
    // Registrar en logs
    await this.loggingService.logUserUpdated(
      adminUser.userId,
      id,
      previousUserState,
      updateDto,
      'Actualización realizada por admin'
    );
    return usuarioActualizado;
  }

}
