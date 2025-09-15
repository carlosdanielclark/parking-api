import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reserva, EstadoReservaDTO } from '../entities/reserva.entity';
import { CreateReservaDto } from './dto/create-reserva.dto';
import { UpdateReservaDto } from './dto/update-reserva.dto';
import { ReservaTransactionService } from './services/reserva-transaction.service';
import { LoggingService } from '../logging/logging.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/get-user.decorator';

/**
 * Servicio principal para la gestión de reservas de parking
 * Caso de uso principal: Cliente desea reservar una plaza de parking
 * Implementa validaciones de negocio y orchestración de transacciones
 */
@Injectable()
export class ReservasService {
  private readonly logger = new Logger(ReservasService.name);

  constructor(
    @InjectRepository(Reserva)
    private readonly reservaRepository: Repository<Reserva>,
    private readonly reservaTransactionService: ReservaTransactionService,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * ✅ CORREGIDO: Crear nueva reserva con logging consistente
   * Caso de uso: Cliente desea reservar una plaza
   * Implementa validaciones completas y transacciones atómicas
   */
  async create(createReservaDto: CreateReservaDto, currentUser: any): Promise<Reserva> {
    this.logger.log(`Creando reserva para usuario ${currentUser.userId}`);

    try {
      if (new Date(createReservaDto.fecha_fin) <= new Date(createReservaDto.fecha_inicio)) {
        throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
      }
      
      // Delegar la lógica compleja al servicio de transacciones
      const reservaCreada = await this.reservaTransactionService.createReservaWithTransaction(
        createReservaDto, 
        currentUser
      );

      // ✅ CORREGIDO: Logging consistente con mensaje esperado por test
      await this.loggingService.logReservationCreated(
        currentUser.userId,
        reservaCreada.id,
        reservaCreada.plaza.id,
        reservaCreada.vehiculo.id,
        { 
          fecha_inicio: reservaCreada.fecha_inicio,
          fecha_fin: reservaCreada.fecha_fin,
          plaza_numero: reservaCreada.plaza.numero_plaza
        }
      );

      this.logger.log(`Reserva creada exitosamente: ${reservaCreada.id} para plaza ${reservaCreada.plaza.numero_plaza}`);
      
      return reservaCreada;

    } catch (error) {
      this.logger.error(`Error al crear reserva: ${error?.message ?? error}`, error?.stack ?? '');
      throw error;
    }
  }

  /**
   * Obtener todas las reservas con filtros opcionales
   * Solo administradores pueden ver todas las reservas
   * Los clientes solo ven sus propias reservas
   */
  async findAll(
    currentUser: AuthenticatedUser,
    filters?: {
      estado?: EstadoReservaDTO;
      fecha_inicio?: Date;
      fecha_fin?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<Reserva[]> {
    this.logger.log(`Consultando reservas para usuario ${currentUser.userId} (${currentUser.role})`);

    try {
      const queryBuilder = this.reservaRepository
        .createQueryBuilder('reserva')
        .leftJoinAndSelect('reserva.usuario', 'usuario')
        .leftJoinAndSelect('reserva.plaza', 'plaza')
        .leftJoinAndSelect('reserva.vehiculo', 'vehiculo');

      // Si no es admin, solo mostrar sus propias reservas
      if (currentUser.role !== 'admin') {
        queryBuilder.where('reserva.usuario_id = :userId', { userId: currentUser.userId });
      }

      // Aplicar filtros opcionales
      if (filters?.estado) {
        queryBuilder.andWhere('reserva.estado = :estado', { estado: filters.estado });
      }

      if (filters?.fecha_inicio) {
        queryBuilder.andWhere('reserva.fecha_inicio >= :fechaInicio', { 
          fechaInicio: filters.fecha_inicio 
        });
      }

      if (filters?.fecha_fin) {
        queryBuilder.andWhere('reserva.fecha_fin <= :fechaFin', { 
          fechaFin: filters.fecha_fin 
        });
      }

      // Ordenar por fecha de creación descendente
      queryBuilder.orderBy('reserva.created_at', 'DESC');

      // Aplicar paginación si se proporciona
      if (filters?.limit) {
        queryBuilder.limit(filters.limit);
      }
      if (filters?.offset) {
        queryBuilder.offset(filters.offset);
      }

      const reservas = await queryBuilder.getMany();
      this.logger.log(`Se encontraron ${reservas.length} reservas`);
      return reservas;

    } catch (error) {
      this.logger.error(`Error al consultar reservas: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al consultar reservas');
    }
  }

  /**
   * Obtener una reserva específica por ID
   * Verifica propiedad si no es administrador
   */
  async findOne(id: string, currentUser: AuthenticatedUser): Promise<Reserva> {
    this.logger.log(`Consultando reserva ${id} para usuario ${currentUser.userId}`);

    const reserva = await this.reservaRepository.findOne({
      where: { id },
      relations: ['usuario', 'plaza', 'vehiculo']
    });

    if (!reserva) {
      this.logger.warn(`Reserva no encontrada: ${id}`);
      throw new NotFoundException(`Reserva con ID ${id} no encontrada`);
    }

    // Verificar propiedad si no es admin
    if (currentUser.role !== 'admin' && reserva.usuario_id !== currentUser.userId) {
      this.logger.warn(`Usuario ${currentUser.userId} intentó acceder a reserva ajena: ${id}`);
      throw new ForbiddenException('No tiene permisos para acceder a esta reserva');
    }

    return reserva;
  }

  /**
   * Actualizar una reserva existente
   * Solo permite modificar fechas y estado
   * Clientes solo pueden cancelar sus propias reservas
   */
  async update(
    id: string, 
    updateReservaDto: UpdateReservaDto, 
    currentUser: AuthenticatedUser
  ): Promise<Reserva> {
    this.logger.log(`Actualizando reserva ${id} por usuario ${currentUser.userId}`);

    const reserva = await this.findOne(id, currentUser);

    // Validar que la reserva pueda ser actualizada
    if (reserva.estado === EstadoReservaDTO.FINALIZADA) {
      throw new BadRequestException('No se puede modificar una reserva finalizada');
    }

    if (reserva.estado === EstadoReservaDTO.CANCELADA) {
      throw new BadRequestException('No se puede modificar una reserva cancelada');
    }

    try {
      // Solo admin puede cambiar cualquier campo
      if (currentUser.role === 'admin') {
        Object.assign(reserva, updateReservaDto);
      } else {
        // Clientes solo pueden cancelar
        if (updateReservaDto.estado && updateReservaDto.estado !== EstadoReservaDTO.CANCELADA) {
          throw new ForbiddenException('Solo puede cancelar su reserva');
        }
        if (updateReservaDto.estado) {
          reserva.estado = updateReservaDto.estado;
        }
      }

      // Validar fechas si se modificaron
      if (updateReservaDto.fecha_inicio && updateReservaDto.fecha_fin) {
        if (updateReservaDto.fecha_fin <= updateReservaDto.fecha_inicio) {
          throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
        }
      }

      const reservaActualizada = await this.reservaRepository.save(reserva);

      // Log si se canceló la reserva
      if (updateReservaDto.estado === EstadoReservaDTO.CANCELADA) {
        await this.loggingService.logReservationCancelled(
          currentUser.userId,
          reserva.id,
          reserva.plaza.id,
          { 
            cancelled_by: currentUser.userId,
            cancellation_reason: 'Usuario canceló la reserva'
          }
        );
      }

      this.logger.log(`Reserva actualizada exitosamente: ${reservaActualizada.id}`);

      return reservaActualizada;

    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error al actualizar reserva ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al actualizar reserva');
    }
  }

  /**
   * Cancelar reserva (wrapper para update)
   */
  async cancel(reservaId: string, currentUser: AuthenticatedUser): Promise<Reserva> {
    this.logger.log(`Cancelando reserva ${reservaId}`);

    try {
      return await this.reservaTransactionService.cancelarReservaWithTransaction(
        reservaId, 
        currentUser.userId
      );
    } catch (error) {
      this.logger.error(`Error al cancelar reserva ${reservaId}: ${error?.message ?? error}`, error?.stack ?? '');
      throw error;
    }
  }

  /**
   * Finalizar reserva (marcar como completada)
   * Solo accesible por administradores
   */
  async finish(reservaId: string): Promise<Reserva> {
    this.logger.log(`Finalizando reserva: ${reservaId}`);

    try {
      return await this.reservaTransactionService.finalizarReservaWithTransaction(reservaId);
    } catch (error) {
      this.logger.error(`Error al finalizar reserva ${reservaId}: ${error?.message ?? error}`, error?.stack ?? '');
      throw error;
    }
  }

  /**
   * Eliminar una reserva
   * Solo administradores pueden eliminar reservas
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Eliminando reserva: ${id}`);

    const reserva = await this.reservaRepository.findOne({ where: { id } });
    if (!reserva) {
      throw new NotFoundException(`Reserva con ID ${id} no encontrada`);
    }

    try {
      await this.reservaRepository.remove(reserva);
      this.logger.log(`Reserva eliminada exitosamente: ${id}`);
    } catch (error) {
      this.logger.error(`Error al eliminar reserva ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al eliminar reserva');
    }
  }

  /**
   * Obtener reservas activas del usuario
   * Útil para validaciones y dashboard del cliente
   */
  async findActiveByUser(userId: string): Promise<Reserva[]> {
    return this.reservaRepository.find({
      where: {
        usuario_id: userId,
        estado: EstadoReservaDTO.ACTIVA
      },
      relations: ['plaza', 'vehiculo'],
      order: { fecha_inicio: 'ASC' }
    });
  }

  /**
   * Verificar si una plaza está disponible en un periodo de tiempo
   * Útil para validaciones antes de crear reservas
   */
  async isPlazaAvailable(
    plazaId: number,
    fechaInicio: Date,
    fechaFin: Date,
    excludeReservaId?: string
  ): Promise<boolean> {
    const queryBuilder = this.reservaRepository
      .createQueryBuilder('reserva')
      .where('reserva.plaza_id = :plazaId', { plazaId })
      .andWhere('reserva.estado = :estado', { estado: EstadoReservaDTO.ACTIVA })
      .andWhere(
        '(reserva.fecha_inicio <= :fechaFin AND reserva.fecha_fin >= :fechaInicio)',
        { fechaInicio, fechaFin }
      );

    if (excludeReservaId) {
      queryBuilder.andWhere('reserva.id != :excludeId', { excludeId: excludeReservaId });
    }

    const conflictingReservations = await queryBuilder.getCount();
    
    return conflictingReservations === 0;
  }

  /**
   * Obtener todas las reservas activas (solo admin/empleado)
   */
  async findActive(): Promise<Reserva[]> {
    this.logger.log('Consultando todas las reservas activas');

    return this.reservaRepository.find({
      where: { estado: EstadoReservaDTO.ACTIVA },
      relations: ['usuario', 'plaza', 'vehiculo'],
      order: { fecha_inicio: 'ASC' }
    });
  }

  /**
   * Obtener todas las reservas de un usuario específico
   * Admin/empleado pueden ver cualquier usuario, clientes solo a sí mismos
   */
  async findByUser(usuarioId: string, currentUser: AuthenticatedUser): Promise<Reserva[]> {
    this.logger.log(`Consultando reservas de usuario ${usuarioId} por ${currentUser.userId}`);

    if (currentUser.role !== 'admin' && currentUser.role !== 'empleado' && currentUser.userId !== usuarioId) {
      this.logger.warn(`Usuario ${currentUser.userId} intentó acceder a reservas de otro usuario`);
      throw new ForbiddenException('No tiene permisos para acceder a estas reservas');
    }

    return this.reservaRepository.find({
      where: { usuario_id: usuarioId },
      relations: ['usuario', 'plaza', 'vehiculo'],
      order: { fecha_inicio: 'DESC' }
    });
  }

}