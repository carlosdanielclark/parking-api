// src/vehiculos/vehiculos.service.ts

import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehiculo } from '../entities/vehiculo.entity';
import { User, UserRole } from '../entities/user.entity';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';

/**
 * Servicio para la gestión completa de vehículos
 * Implementa operaciones CRUD con validaciones de propiedad
 * Maneja autorización: solo propietarios y admins pueden gestionar vehículos
 */
@Injectable()
export class VehiculosService {
  private readonly logger = new Logger(VehiculosService.name);

  constructor(
    @InjectRepository(Vehiculo)
    private readonly vehiculoRepository: Repository<Vehiculo>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Crear un nuevo vehículo
   * Solo el propietario o administradores pueden crear vehículos
   * Valida que la placa sea única y el usuario exista
   * 
   * @param createVehiculoDto - Datos del vehículo a crear
   * @param currentUser - Usuario autenticado que realiza la operación
   * @returns Vehículo creado con información del propietario
   * @throws ForbiddenException si no es propietario ni admin
   * @throws BadRequestException si la placa ya existe o usuario no encontrado
   */
  async create(createVehiculoDto: CreateVehiculoDto, currentUser: any): Promise<Vehiculo> {
    const { usuario_id, placa } = createVehiculoDto;

    this.logger.log(`Creando vehículo con placa ${placa} para usuario ${usuario_id} por ${currentUser.userId}`);

    // Validar permisos: solo el propietario o admin pueden crear vehículos
    if (currentUser.role !== UserRole.ADMIN && currentUser.userId !== usuario_id) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó crear vehículo para usuario ${usuario_id}`);
      throw new ForbiddenException('Solo puedes registrar vehículos para ti mismo');
    }

    try {
      // Verificar que la placa sea única
      const existingVehiculo = await this.vehiculoRepository.findOne({ where: { placa } });
      if (existingVehiculo) {
        this.logger.warn(`Intento de registro con placa duplicada: ${placa}`);
        throw new BadRequestException(`La placa ${placa} ya está registrada en el sistema`);
      }

      // Verificar que el usuario existe
      const usuario = await this.userRepository.findOne({ where: { id: usuario_id } });
      if (!usuario) {
        this.logger.warn(`Usuario no encontrado: ${usuario_id}`);
        throw new BadRequestException('Usuario no encontrado');
      }

      // Crear vehículo
      const vehiculo = this.vehiculoRepository.create({
        ...createVehiculoDto,
        usuario: usuario,
      });

      const savedVehiculo = await this.vehiculoRepository.save(vehiculo);
      
      this.logger.log(`Vehículo creado exitosamente: ${savedVehiculo.placa} (${savedVehiculo.id})`);
      
      return savedVehiculo;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error al crear vehículo: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al crear vehículo');
    }
  }

  /**
   * Obtener todos los vehículos
   * Administradores: ven todos los vehículos
   * Empleados: ven todos los vehículos (para consultas operativas)
   * Clientes: solo ven sus propios vehículos
   * 
   * @param currentUser - Usuario autenticado
   * @returns Lista de vehículos según permisos del usuario
   */
  async findAll(currentUser: any): Promise<Vehiculo[]> {
    this.logger.log(`Obteniendo vehículos para usuario ${currentUser.userId} (${currentUser.role})`);

    try {
      let vehiculos: Vehiculo[];

      if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.EMPLEADO) {
        // Administradores y empleados ven todos los vehículos
        vehiculos = await this.vehiculoRepository.find({
          relations: ['usuario'],
          order: { created_at: 'DESC' }
        });
      } else {
        // Clientes solo ven sus propios vehículos
        vehiculos = await this.vehiculoRepository.find({
          where: { usuario: { id: currentUser.userId } },
          relations: ['usuario'],
          order: { created_at: 'DESC' }
        });
      }

      this.logger.log(`Se encontraron ${vehiculos.length} vehículos para el usuario`);
      
      return vehiculos;
    } catch (error) {
      this.logger.error(`Error al obtener vehículos: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener vehículos');
    }
  }

  /**
   * Obtener un vehículo específico por ID
   * Solo el propietario, empleados y administradores pueden ver el vehículo
   * 
   * @param id - ID del vehículo a buscar
   * @param currentUser - Usuario autenticado
   * @returns Vehículo encontrado con información completa
   * @throws NotFoundException si el vehículo no existe
   * @throws ForbiddenException si no tiene permisos
   */
  async findOne(id: string, currentUser: any): Promise<Vehiculo> {
    this.logger.log(`Buscando vehículo ${id} para usuario ${currentUser.userId} (${currentUser.role})`);

    try {
      const vehiculo = await this.vehiculoRepository.findOne({
        where: { id },
        relations: ['usuario', 'reservas']
      });

      if (!vehiculo) {
        this.logger.warn(`Vehículo no encontrado: ${id}`);
        throw new NotFoundException(`Vehículo con ID ${id} no encontrado`);
      }

      // Verificar permisos: solo propietario, empleados y admins pueden ver el vehículo
      if (currentUser.role === UserRole.CLIENTE && vehiculo.usuario.id !== currentUser.userId) {
        this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó acceder a vehículo ${id} de otro usuario`);
        throw new ForbiddenException('No tienes permisos para ver este vehículo');
      }

      this.logger.log(`Vehículo encontrado: ${vehiculo.placa} (propietario: ${vehiculo.usuario.email})`);
      
      return vehiculo;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error al buscar vehículo ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al buscar vehículo');
    }
  }

  /**
   * Actualizar un vehículo existente
   * Solo el propietario y administradores pueden actualizar
   * No permite cambiar el propietario por seguridad
   * 
   * @param id - ID del vehículo a actualizar
   * @param updateVehiculoDto - Datos a actualizar
   * @param currentUser - Usuario autenticado
   * @returns Vehículo actualizado
   * @throws ForbiddenException si no tiene permisos
   * @throws BadRequestException si la nueva placa ya existe
   */
  async update(id: string, updateVehiculoDto: UpdateVehiculoDto, currentUser: any): Promise<Vehiculo> {
    this.logger.log(`Actualizando vehículo ${id} por usuario ${currentUser.userId} (${currentUser.role})`);

    // Obtener vehículo y verificar permisos
    const vehiculo = await this.findOne(id, currentUser);

    // Solo el propietario o admin pueden actualizar
    if (currentUser.role !== UserRole.ADMIN && vehiculo.usuario.id !== currentUser.userId) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó actualizar vehículo ${id}`);
      throw new ForbiddenException('Solo puedes actualizar tus propios vehículos');
    }

    try {
      // Verificar placa única si se cambia
      if (updateVehiculoDto.placa && updateVehiculoDto.placa !== vehiculo.placa) {
        const existingVehiculo = await this.vehiculoRepository.findOne({
          where: { placa: updateVehiculoDto.placa }
        });
        
        if (existingVehiculo) {
          this.logger.warn(`Intento de cambio a placa duplicada: ${updateVehiculoDto.placa}`);
          throw new BadRequestException(`La placa ${updateVehiculoDto.placa} ya está registrada por otro vehículo`);
        }
      }

      // Aplicar actualizaciones
      await this.vehiculoRepository.update(id, updateVehiculoDto);
      const updatedVehiculo = await this.findOne(id, currentUser);
      
      this.logger.log(`Vehículo actualizado exitosamente: ${updatedVehiculo.placa}`);
      
      return updatedVehiculo;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error al actualizar vehículo ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al actualizar vehículo');
    }
  }

  /**
   * Eliminar un vehículo del sistema
   * Solo el propietario y administradores pueden eliminar
   * Verifica que no tenga reservas activas antes de eliminar
   * 
   * @param id - ID del vehículo a eliminar
   * @param currentUser - Usuario autenticado
   * @throws ForbiddenException si no tiene permisos
   * @throws BadRequestException si tiene reservas activas
   */
  async remove(id: string, currentUser: any): Promise<void> {
    this.logger.log(`Eliminando vehículo ${id} por usuario ${currentUser.userId} (${currentUser.role})`);

    // Obtener vehículo y verificar permisos
    const vehiculo = await this.findOne(id, currentUser);

    // Solo el propietario o admin pueden eliminar
    if (currentUser.role !== UserRole.ADMIN && vehiculo.usuario.id !== currentUser.userId) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó eliminar vehículo ${id}`);
      throw new ForbiddenException('Solo puedes eliminar tus propios vehículos');
    }

    try {
      // Verificar si tiene reservas activas
      const hasActiveReservations = vehiculo.reservas?.some(
        reserva => reserva.estado === 'activa'
      );

      if (hasActiveReservations) {
        this.logger.warn(`Intento de eliminar vehículo ${vehiculo.placa} con reservas activas`);
        throw new BadRequestException('No se puede eliminar un vehículo con reservas activas');
      }

      await this.vehiculoRepository.remove(vehiculo);
      
      this.logger.log(`Vehículo eliminado exitosamente: ${vehiculo.placa} (${id})`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error al eliminar vehículo ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al eliminar vehículo');
    }
  }

  /**
   * Obtener vehículos de un usuario específico
   * Solo accesible por el propio usuario, empleados y administradores
   * 
   * @param usuarioId - ID del usuario propietario
   * @param currentUser - Usuario autenticado
   * @returns Lista de vehículos del usuario
   * @throws ForbiddenException si no tiene permisos
   */
  async findByUsuario(usuarioId: string, currentUser: any): Promise<Vehiculo[]> {
    this.logger.log(`Obteniendo vehículos del usuario ${usuarioId} por ${currentUser.userId} (${currentUser.role})`);

    // Verificar permisos
    if (currentUser.role === UserRole.CLIENTE && currentUser.userId !== usuarioId) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó ver vehículos del usuario ${usuarioId}`);
      throw new ForbiddenException('Solo puedes ver tus propios vehículos');
    }

    try {
      const vehiculos = await this.vehiculoRepository.find({
        where: { usuario: { id: usuarioId } },
        relations: ['usuario'],
        order: { created_at: 'DESC' }
      });

      this.logger.log(`Se encontraron ${vehiculos.length} vehículos para el usuario ${usuarioId}`);
      
      return vehiculos;
    } catch (error) {
      this.logger.error(`Error al obtener vehículos del usuario ${usuarioId}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener vehículos del usuario');
    }
  }
}
