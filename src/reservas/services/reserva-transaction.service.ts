import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner, DataSource } from 'typeorm';
import { Reserva, EstadoReserva } from '../../entities/reserva.entity';
import { Plaza, EstadoPlaza } from '../../entities/plaza.entity';
import { User, UserRole } from '../../entities/user.entity';
import { Vehiculo } from '../../entities/vehiculo.entity';
import { CreateReservaDto } from '../dto/create-reserva.dto';
import { LoggingService } from '../../logging/logging.service';

/**
 * Servicio especializado en transacciones de reservas
 * Maneja la lógica compleja de concurrencia y transacciones de base de datos
 * Garantiza consistencia en operaciones críticas de reserva
 */
@Injectable()
export class ReservaTransactionService {
  private readonly logger = new Logger(ReservaTransactionService.name);

  constructor(
    @InjectRepository(Reserva)
    private readonly reservaRepository: Repository<Reserva>,
    @InjectRepository(Plaza)
    private readonly plazaRepository: Repository<Plaza>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Vehiculo)
    private readonly vehiculoRepository: Repository<Vehiculo>,
    private readonly dataSource: DataSource,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Crear reserva con transacción completa y manejo de concurrencia
   * Utiliza transacciones de base de datos para garantizar consistencia
   * 
   * @param createReservaDto - Datos de la reserva a crear
   * @param currentUser - Usuario autenticado
   * @returns Reserva creada con todas las relaciones
   * @throws BadRequestException, NotFoundException, ForbiddenException
   */
  async createReservaWithTransaction(
    createReservaDto: CreateReservaDto,
    currentUser: any
  ): Promise<Reserva> {
    const { usuario_id, plaza_id, vehiculo_id, fecha_inicio, fecha_fin } = createReservaDto;

    this.logger.log(`Iniciando transacción de reserva: Plaza ${plaza_id}, Usuario ${usuario_id}, Vehículo ${vehiculo_id}`);

    // Iniciar transacción de base de datos
    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // VALIDACIÓN DE ENTIDADES DENTRO DE LA TRANSACCIÓN
      
      // 1. Verificar que el usuario existe
      const usuario = await queryRunner.manager.findOne(User, { 
        where: { id: usuario_id } 
      });
      if (!usuario) {
        this.logger.warn(`Usuario no encontrado: ${usuario_id}`);
        throw new NotFoundException('Usuario no encontrado');
      }

      // 2. Verificar que la plaza existe
      const plaza = await queryRunner.manager.findOne(Plaza, { 
        where: { id: plaza_id } 
      });
      if (!plaza) {
        this.logger.warn(`Plaza no encontrada: ${plaza_id}`);
        throw new NotFoundException('Plaza no encontrada');
      }

      // 3. Verificar que el vehículo existe y pertenece al usuario
      const vehiculo = await queryRunner.manager.findOne(Vehiculo, { 
        where: { id: vehiculo_id },
        relations: ['usuario']
      });
      if (!vehiculo) {
        this.logger.warn(`Vehículo no encontrado: ${vehiculo_id}`);
        throw new NotFoundException('Vehículo no encontrado');
      }

      // Validar propiedad del vehículo
      if (currentUser.role !== UserRole.ADMIN && vehiculo.usuario.id !== usuario_id) {
        this.logger.warn(`Vehículo ${vehiculo_id} no pertenece al usuario ${usuario_id}`);
        throw new ForbiddenException('El vehículo no pertenece al usuario especificado');
      }

      // VALIDACIONES DE DISPONIBILIDAD CON BLOQUEO PESIMISTA

      // 4. Verificar disponibilidad de plaza con bloqueo (previene condiciones de carrera)
      const plazaLocked = await queryRunner.manager.findOne(Plaza, {
        where: { id: plaza_id },
        lock: { mode: 'pessimistic_write' }
      });

      if (plazaLocked?.estado !== EstadoPlaza.LIBRE) {
        this.logger.warn(`Plaza ${plaza_id} no disponible. Estado actual: ${plazaLocked?.estado}`);
        throw new BadRequestException(`La plaza ${plaza.numero_plaza} no está disponible`);
      }

      // 5. Verificar conflictos de tiempo en la plaza
      const inicioDate = new Date(fecha_inicio);
      const finDate = new Date(fecha_fin);

      const reservaConflicto = await queryRunner.manager.createQueryBuilder(Reserva, 'reserva')
        .where('reserva.plaza_id = :plazaId', { plazaId: plaza_id })
        .andWhere('reserva.estado = :estado', { estado: EstadoReserva.ACTIVA })
        .andWhere('NOT (reserva.fecha_fin <= :inicio OR reserva.fecha_inicio >= :fin)', {
          inicio: inicioDate,
          fin: finDate
        })
        .getOne();

      if (reservaConflicto) {
        this.logger.warn(`Conflicto de tiempo en plaza ${plaza_id}. Reserva existente: ${reservaConflicto.id}`);
        throw new BadRequestException(`La plaza ya tiene una reserva activa en el período especificado`);
      }

      // 6. Verificar que el vehículo no tenga otra reserva activa en el mismo período
      const vehiculoConflicto = await queryRunner.manager.createQueryBuilder(Reserva, 'reserva')
        .where('reserva.vehiculo_id = :vehiculoId', { vehiculoId: vehiculo_id })
        .andWhere('reserva.estado = :estado', { estado: EstadoReserva.ACTIVA })
        .andWhere('NOT (reserva.fecha_fin <= :inicio OR reserva.fecha_inicio >= :fin)', {
          inicio: inicioDate,
          fin: finDate
        })
        .getOne();

      if (vehiculoConflicto) {
        this.logger.warn(`Vehículo ${vehiculo_id} ya tiene reserva activa: ${vehiculoConflicto.id}`);
        throw new BadRequestException(`El vehículo ya tiene una reserva activa para ese período`);
      }

      // CREACIÓN DE RESERVA (OPERACIÓN ATÓMICA)

      // 7. Crear la reserva
      const nuevaReserva = queryRunner.manager.create(Reserva, {
        usuario: usuario,
        plaza: plaza,
        vehiculo: vehiculo,
        fecha_inicio: inicioDate,
        fecha_fin: finDate,
        estado: EstadoReserva.ACTIVA,
      });

      const reservaGuardada = await queryRunner.manager.save(Reserva, nuevaReserva);

      // 8. Actualizar estado de la plaza a OCUPADA
      await queryRunner.manager.update(Plaza, plaza_id, { 
        estado: EstadoPlaza.OCUPADA 
      });

      // CONFIRMACIÓN DE TRANSACCIÓN
      await queryRunner.commitTransaction();

      this.logger.log(`Reserva creada exitosamente: ${reservaGuardada.id} - Plaza ${plaza.numero_plaza} para vehículo ${vehiculo.placa}`);

      // Logging de auditoría (fuera de la transacción)
      try {
        await this.loggingService.logReservationCreated(
          usuario_id,
          reservaGuardada.id,
          plaza_id,
          vehiculo_id,
          { 
            inicio: inicioDate.toISOString(), 
            fin: finDate.toISOString(),
            plazaNumero: plaza.numero_plaza,
            vehiculoPlaca: vehiculo.placa
          }
        );
      } catch (logError) {
        // Log error but don't fail the operation
        this.logger.warn(`Error al registrar log de reserva: ${logError.message}`);
      }

      // Retornar reserva completa con relaciones
      const reservaCompleta = await this.reservaRepository.findOne({
        where: { id: reservaGuardada.id },
        relations: ['usuario', 'plaza', 'vehiculo']
      });

      if (!reservaCompleta) {
        throw new NotFoundException('No se pudo cargar la reserva completa después de crearla');
      }

      return reservaCompleta;

    } catch (error) {
      // ROLLBACK DE TRANSACCIÓN EN CASO DE ERROR
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error en transacción de reserva: ${error.message}`, error.stack);
      
      // Re-lanzar errores conocidos
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      
      // Error genérico para errores inesperados
      throw new BadRequestException('Error interno al crear reserva');
    } finally {
      // LIBERAR RECURSOS
      await queryRunner.release();
    }
  }

  /**
   * Cancelar reserva con transacción (liberar plaza)
   * 
   * @param reservaId - ID de la reserva a cancelar
   * @param currentUser - Usuario autenticado
   * @returns Reserva cancelada
   */
  async cancelReservaWithTransaction(reservaId: string, currentUser: any): Promise<Reserva> {
    this.logger.log(`Iniciando cancelación de reserva: ${reservaId} por usuario ${currentUser.userId}`);

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Buscar reserva con bloqueo
      const reserva = await queryRunner.manager.findOne(Reserva, {
        where: { id: reservaId },
        relations: ['usuario', 'plaza', 'vehiculo'],
        lock: { mode: 'pessimistic_write' }
      });

      if (!reserva) {
        throw new NotFoundException('Reserva no encontrada');
      }

      // Verificar permisos
      if (currentUser.role !== UserRole.ADMIN && reserva.usuario.id !== currentUser.userId) {
        throw new ForbiddenException('No tienes permisos para cancelar esta reserva');
      }

      // Verificar que la reserva esté activa
      if (reserva.estado !== EstadoReserva.ACTIVA) {
        throw new BadRequestException('Solo se pueden cancelar reservas activas');
      }

      // Actualizar estado de reserva
      await queryRunner.manager.update(Reserva, reservaId, { 
        estado: EstadoReserva.CANCELADA 
      });

      // Liberar plaza
      await queryRunner.manager.update(Plaza, reserva.plaza.id, { 
        estado: EstadoPlaza.LIBRE 
      });

      await queryRunner.commitTransaction();

      this.logger.log(`Reserva cancelada exitosamente: ${reservaId} - Plaza ${reserva.plaza.numero_plaza} liberada`);

      // Logging de auditoría
      try {
        await this.loggingService.logReservationCancelled(
          currentUser.userId,
          reservaId,
          reserva.plaza.id,
          { 
            motivo: 'Cancelación por usuario',
            plazaNumero: reserva.plaza.numero_plaza 
          }
        );
      } catch (logError) {
        this.logger.warn(`Error al registrar log de cancelación: ${logError.message}`);
      }

      // Retornar reserva actualizada
      const reservaActualizada = await this.reservaRepository.findOne({
        where: { id: reservaId },
        relations: ['usuario', 'plaza', 'vehiculo']
      });

      return reservaActualizada!;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error en cancelación de reserva: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Finalizar reserva automáticamente (para tareas programadas)
   * 
   * @param reservaId - ID de la reserva a finalizar
   * @returns Reserva finalizada
   */
  async finishReservaWithTransaction(reservaId: string): Promise<Reserva> {
    this.logger.log(`Finalizando reserva automáticamente: ${reservaId}`);

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reserva = await queryRunner.manager.findOne(Reserva, {
        where: { id: reservaId },
        relations: ['usuario', 'plaza', 'vehiculo'],
        lock: { mode: 'pessimistic_write' }
      });

      if (!reserva) {
        throw new NotFoundException('Reserva no encontrada');
      }

      if (reserva.estado !== EstadoReserva.ACTIVA) {
        throw new BadRequestException('Solo se pueden finalizar reservas activas');
      }

      // Actualizar estados
      await queryRunner.manager.update(Reserva, reservaId, { 
        estado: EstadoReserva.FINALIZADA 
      });

      await queryRunner.manager.update(Plaza, reserva.plaza.id, { 
        estado: EstadoPlaza.LIBRE 
      });

      await queryRunner.commitTransaction();

      this.logger.log(`Reserva finalizada: ${reservaId} - Plaza ${reserva.plaza.numero_plaza} liberada`);

      return reserva;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al finalizar reserva: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
