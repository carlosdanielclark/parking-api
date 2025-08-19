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

    this.logger.log(`Creando usuario con email: ${email}`);

    // Verificar si el email ya existe en el sistema
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Intento de creación con email duplicado: ${email}`);
      throw new BadRequestException('El email ya está registrado en el sistema');
    }

    try {
      // Encriptar la contraseña usando bcrypt
      const hashedPassword = await bcrypt.hash(password, authConstants.saltRounds);

      // Crear la entidad usuario
      const newUser = this.userRepository.create({
        ...userData,
        email,
        password: hashedPassword,
      });

      // Guardar en la base de datos
      const savedUser = await this.userRepository.save(newUser);
      
      this.logger.log(`Usuario creado exitosamente: ${savedUser.id} - ${savedUser.email} (${savedUser.role})`);

      // Retornar usuario sin contraseña por seguridad
      const { password: _, ...result } = savedUser;
      return result;
    } catch (error) {
      this.logger.error(`Error al crear usuario: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al crear usuario');
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
    this.logger.log('Obteniendo lista de todos los usuarios');
    
    try {
      const users = await this.userRepository.find({
        order: { created_at: 'DESC' }
      });
      
      this.logger.log(`Se encontraron ${users.length} usuarios`);
      
      // Remover contraseñas de todos los usuarios
      return users.map(({ password, ...user }) => user);
    } catch (error) {
      this.logger.error(`Error al obtener usuarios: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener usuarios');
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
    this.logger.log(`Buscando usuario con ID: ${id}`);

    try {
      const user = await this.userRepository.findOne({ 
        where: { id },
        relations: ['vehiculos', 'reservas']
      });
      
      if (!user) {
        this.logger.warn(`Usuario no encontrado con ID: ${id}`);
        throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
      }

      this.logger.log(`Usuario encontrado: ${user.email} (${user.role})`);
      
      // Retornar sin contraseña
      const { password, ...result } = user;
      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error al buscar usuario ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al buscar usuario');
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
    // Los usuarios pueden actualizar su propio perfil
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

      // Actualizar usuario
      await this.userRepository.update(id, updateUserDto);
      const updatedUser = await this.userRepository.findOne({ where: { id } });
      
      //Verifica que updatedUser no sea null antes de acceder a sus propiedades.
      if (!updatedUser) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado tras actualización`);
      }

      this.logger.log(`Usuario actualizado exitosamente: ${updatedUser.id} - ${updatedUser.email}`);

      // Retornar sin contraseña
      const { password: _, ...result } = updatedUser;
      return result;
    } catch (error) {
      if (error instanceof BadRequestException) {
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
    this.logger.log(`Obteniendo usuarios con rol: ${role}`);

    try {
      const users = await this.userRepository.find({ 
        where: { role },
        order: { created_at: 'DESC' }
      });
      
      this.logger.log(`Se encontraron ${users.length} usuarios con rol ${role}`);
      
      return users.map(({ password, ...user }) => user);
    } catch (error) {
      this.logger.error(`Error al obtener usuarios por rol ${role}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener usuarios por rol');
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
  async getUserStats(): Promise<{total: number, admins: number, empleados: number, clientes: number}> {
    this.logger.log('Obteniendo estadísticas de usuarios');

    try {
      const total = await this.userRepository.count();
      const admins = await this.userRepository.count({ where: { role: UserRole.ADMIN } });
      const empleados = await this.userRepository.count({ where: { role: UserRole.EMPLEADO } });
      const clientes = await this.userRepository.count({ where: { role: UserRole.CLIENTE } });

      const stats = { total, admins, empleados, clientes };
      this.logger.log(`Estadísticas de usuarios: ${JSON.stringify(stats)}`);
      
      return stats;
    } catch (error) {
      this.logger.error(`Error al obtener estadísticas de usuarios: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener estadísticas');
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
