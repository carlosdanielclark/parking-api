// src/reservas/services/reserva-transaction.service.ts
import { Injectable, Logger, BadRequestException, NotFoundException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { Reserva, EstadoReservaDTO } from '../../entities/reserva.entity';
import { Plaza, EstadoPlaza } from '../../entities/plaza.entity';
import { User, UserRole } from '../../entities/user.entity';
import { Vehiculo } from '../../entities/vehiculo.entity';
import { CreateReservaDto } from '../dto/create-reserva.dto';
import { LoggingService } from '../../logging/logging.service';

/**
 * Servicio especializado para operaciones transaccionales de reservas
 * Maneja la lógica compleja de concurrencia y transacciones
 * Garantiza consistencia de datos en operaciones críticas
 */
@Injectable()
export class ReservaTransactionService {
  private readonly logger = new Logger(ReservaTransactionService.name);

  constructor(
    @InjectRepository(Reserva)
    private readonly reservaRepository: Repository<Reserva>,
    private readonly dataSource: DataSource,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Crear nueva reserva con transacción completa
   * Maneja concurrencia y validaciones complejas dentro de una transacción
   * Garantiza consistencia de datos y rollback automático en caso de error
   * 
   * @param createReservaDto - Datos de la reserva a crear
   * @param currentUser - Usuario autenticado que realiza la operación
   * @returns Reserva creada con relaciones completas
   */
  async createReservaWithTransaction(
    createReservaDto: CreateReservaDto,
    currentUser: any
  ): Promise<Reserva> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { usuario_id, plaza_id, vehiculo_id, fecha_inicio, fecha_fin } = createReservaDto;
      
      const fechaInicio = new Date(fecha_inicio);
      const fechaFin = new Date(fecha_fin);
      const ahora = new Date();

      // Mantener validación coherente con ReservasService (doble check defensivo)
      if (!currentUser?.userId || currentUser.userId !== usuario_id) {
        this.logger.warn(`Intento de crear reserva para otro usuario. Auth=${currentUser?.userId} Payload=${usuario_id}`);
        throw new ForbiddenException('Solo puedes crear reservas para ti mismo');
      }

      // 1. Validar vehículo (pertenencia y existencia)
      const vehiculo = await queryRunner.manager.findOne(Vehiculo, {
        where: { id: vehiculo_id, usuario_id },
        relations: ['usuario']
      });
      if (!vehiculo) {
        throw new BadRequestException('El vehículo especificado no existe o no pertenece al usuario');
      }

      // 2. Validar plaza existe y está LIBRE con lock pesimista
      // Unificar a BadRequestException('La plaza no está disponible') para caso de indisponibilidad
      const plaza = await queryRunner.manager
        .createQueryBuilder(Plaza, 'plaza')
        .setLock('pessimistic_write')
        .where('plaza.id = :plazaId', { plazaId: plaza_id })
        .andWhere('plaza.estado = :estado', { estado: EstadoPlaza.LIBRE })
        .getOne();
        
      if (!plaza) {
        // El test de concurrencia espera un 400 cuando la plaza se ocupa concurrentemente
        throw new BadRequestException('La plaza no está disponible');
      }

      // 3. Verificar solapamiento de reservas existentes en la misma plaza (bloqueo pesimista)
      // Mantener setLock('pessimistic_write') para asegurar consistencia bajo concurrencia
      const solapamiento = await queryRunner.manager
        .createQueryBuilder(Reserva, 'reserva')
        .setLock('pessimistic_write')
        .where('reserva.plaza_id = :plazaId', { plazaId: plaza_id })
        .andWhere('reserva.estado = :estado', { estado: EstadoReservaDTO.ACTIVA })
        .andWhere('(reserva.fecha_inicio < :fin AND reserva.fecha_fin > :inicio)', {
          inicio: new Date(fecha_inicio),
          fin: new Date(fecha_fin),
        })
        .getOne();

      if (solapamiento) {
        throw new BadRequestException('La plaza no está disponible en el período solicitado');
      }

      // 4. Validar que el vehículo no tenga reservas activas en el mismo período
      const reservaVehiculoConflictiva = await queryRunner.manager
        .createQueryBuilder(Reserva, 'reserva')
        .where('reserva.vehiculo_id = :vehiculoId', { vehiculoId: vehiculo_id })
        .andWhere('reserva.estado = :estado', { estado: EstadoReservaDTO.ACTIVA })
        .andWhere('(reserva.fecha_inicio < :fin AND reserva.fecha_fin > :inicio)', {
          inicio: new Date(fecha_inicio),
          fin: new Date(fecha_fin),
        })
        .getOne();

      if (reservaVehiculoConflictiva) {
        throw new BadRequestException('El vehículo ya tiene una reserva activa en el período solicitado');
      }

      // ✅ Validación 1: fecha_inicio debe ser futura
      if (fechaInicio <= ahora) {
        throw new BadRequestException('fecha de inicio debe ser futura');
      }
      // ✅ Validación 2: fecha_fin debe ser posterior a fecha_inicio
      if (fechaFin <= fechaInicio) {
        throw new BadRequestException('fecha de fin debe ser posterior');
      }

      // 5. Crear reserva (persistencia atómica)
      const nuevaReserva = queryRunner.manager.create(Reserva, {
        usuario_id,
        plaza_id,
        vehiculo_id,
        fecha_inicio: new Date(fecha_inicio),
        fecha_fin: new Date(fecha_fin),
        estado: EstadoReservaDTO.ACTIVA,
      });

      const reservaGuardada = await queryRunner.manager.save(nuevaReserva);

      // 6. Actualizar estado de plaza a OCUPADA dentro de la misma transacción
      await queryRunner.manager.update(Plaza, plaza_id, { estado: EstadoPlaza.OCUPADA });

      // 7. Confirmar transacción
      await queryRunner.commitTransaction();

      // 8. Retornar reserva con relaciones completas (fuera de la transacción)
      const reservaCompleta = await this.dataSource.getRepository(Reserva).findOne({
        where: { id: reservaGuardada.id },
        relations: ['usuario', 'plaza', 'vehiculo'],
      });
      if (!reservaCompleta) {
        throw new InternalServerErrorException('Error al recuperar la reserva creada');
      }
      return reservaCompleta;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error en transacción de reserva: ${error.message}`, error.stack);

      if (
        error instanceof BadRequestException || 
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Error interno al crear la reserva');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Finalizar reserva con transacción
   * Actualiza estado de reserva y libera plaza de manera atómica
   * 
   * @param reservaId - ID de la reserva a finalizar
   * @returns Reserva finalizada
   */
  async finalizarReservaWithTransaction(reservaId: string): Promise<Reserva> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(`Finalizando reserva: ${reservaId}`);

      // 1. Obtener reserva con bloqueo
      const reserva = await queryRunner.manager.findOne(Reserva, {
        where: { id: reservaId },
        relations: ['usuario', 'plaza', 'vehiculo'],
        lock: { mode: 'pessimistic_write' }
      });

      if (!reserva) {
        throw new NotFoundException('Reserva no encontrada');
      }

      if (reserva.estado !== EstadoReservaDTO.ACTIVA) {
        throw new BadRequestException('Solo se pueden finalizar reservas activas');
      }

      // 2. Actualizar estado de reserva
      await queryRunner.manager.update(Reserva, reservaId, {
        estado: EstadoReservaDTO.FINALIZADA
      });

      // 3. Liberar plaza
      await queryRunner.manager.update(Plaza, reserva.plaza.id, {
        estado: EstadoPlaza.LIBRE
      });

      // 4. Confirmar transacción
      await queryRunner.commitTransaction();

      // 5. Recargar datos actualizados
      const reservaFinalizada = await this.reservaRepository.findOne({
        where: { id: reservaId },
        relations: ['usuario', 'plaza', 'vehiculo']
      });

      this.logger.log(`Reserva finalizada exitosamente: ${reservaId} - Plaza ${reserva.plaza.numero_plaza} liberada`);

      return reservaFinalizada!;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al finalizar reserva ${reservaId}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * ✅ CORREGIDO: Cancelar reserva con transacción
   * Soluciona el error "FOR UPDATE cannot be applied to the nullable side of an outer join"
   * Separando el bloqueo pesimista de las consultas con LEFT JOIN
   * 
   * @param reservaId - ID de la reserva a cancelar
   * @param usuarioId - ID del usuario que realiza la cancelación
   * @returns Reserva cancelada
   */
  async cancelarReservaWithTransaction(reservaId: string, usuarioId: string): Promise<Reserva> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(`Cancelando reserva: ${reservaId} por usuario ${usuarioId}`);

      // ✅ PASO 1: Primero bloquear solo la fila de la reserva (sin JOINs)
      const reservaParaBloqueo = await queryRunner.manager
        .createQueryBuilder(Reserva, 'reserva')
        .where('reserva.id = :reservaId', { reservaId })
        .setLock('pessimistic_write') // Esto genera FOR UPDATE solo en la tabla principal
        .getOne();

      if (!reservaParaBloqueo) {
        throw new NotFoundException(`Reserva con ID ${reservaId} no encontrada`);
      }

      // ✅ PASO 2: Verificar permisos del usuario
      if (reservaParaBloqueo.usuario_id !== usuarioId) {
        throw new ForbiddenException('No tienes permisos para cancelar esta reserva');
      }

      // ✅ PASO 3: Verificar que la reserva se pueda cancelar
      if (reservaParaBloqueo.estado !== EstadoReservaDTO.ACTIVA) {
        throw new BadRequestException(`No se puede cancelar una reserva en estado ${reservaParaBloqueo.estado}`);
      }

      // ✅ PASO 4: Obtener los datos completos con JOINs (sin FOR UPDATE)
      const reservaCompleta = await queryRunner.manager
        .createQueryBuilder(Reserva, 'reserva')
        .leftJoinAndSelect('reserva.usuario', 'usuario')
        .leftJoinAndSelect('reserva.plaza', 'plaza') 
        .leftJoinAndSelect('reserva.vehiculo', 'vehiculo')
        .where('reserva.id = :reservaId', { reservaId })
        .getOne();

      if (!reservaCompleta) {
        throw new NotFoundException(`Error al obtener datos completos de la reserva ${reservaId}`);
      }

      // ✅ PASO 5: Actualizar el estado de la reserva
      await queryRunner.manager
        .createQueryBuilder()
        .update(Reserva)
        .set({ 
          estado: EstadoReservaDTO.CANCELADA,
          updated_at: new Date()
        })
        .where('id = :reservaId', { reservaId })
        .execute();

      // ✅ PASO 6: Liberar la plaza
      if (reservaCompleta.plaza) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(Plaza)
          .set({ 
            estado: EstadoPlaza.LIBRE
          })
          .where('id = :plazaId', { plazaId: reservaCompleta.plaza.id })
          .execute();
      }

      // 7. Confirmar transacción
      await queryRunner.commitTransaction();

      // 8. Recargar datos actualizados
      const reservaCancelada = await this.reservaRepository.findOne({
        where: { id: reservaId },
        relations: ['usuario', 'plaza', 'vehiculo']
      });

      this.logger.log(`Reserva cancelada exitosamente: ${reservaId} - Plaza ${reservaCompleta.plaza?.numero_plaza} liberada`);

      return reservaCancelada!;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al cancelar reserva ${reservaId}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // MÉTODOS PRIVADOS DE VALIDACIÓN

  /**
   * Validar que el usuario existe y está activo
   */
  private async validarUsuario(queryRunner: QueryRunner, usuarioId: string): Promise<User> {
    const usuario = await queryRunner.manager.findOne(User, { 
      where: { id: usuarioId } 
    });

    if (!usuario) {
      throw new BadRequestException('Usuario no encontrado');
    }

    return usuario;
  }

  /**
   * Validar plaza y aplicar bloqueo pesimista para evitar condiciones de carrera
   */
  private async validarYBloquearPlaza(queryRunner: QueryRunner, plazaId: number): Promise<Plaza> {
    const plaza = await queryRunner.manager.findOne(Plaza, {
      where: { id: plazaId },
      lock: { mode: 'pessimistic_write' } // Bloqueo pesimista
    });

    if (!plaza) {
      // Unificar semántica de indisponibilidad
      throw new BadRequestException('La plaza no está disponible');
    }

    if (plaza.estado !== EstadoPlaza.LIBRE) {
      // Homologar mensaje y tipo de error
      throw new BadRequestException('La plaza no está disponible');
    }

    return plaza;
  }

  /**
   * Validar que el vehículo existe y pertenece al usuario
   */
  private async validarVehiculo(
    queryRunner: QueryRunner, 
    vehiculoId: string, 
    usuarioId: string
  ): Promise<Vehiculo> {
    const vehiculo = await queryRunner.manager.findOne(Vehiculo, {
      where: { id: vehiculoId },
      relations: ['usuario']
    });

    if (!vehiculo) {
      throw new BadRequestException('Vehículo no encontrado');
    }

    if (vehiculo.usuario.id !== usuarioId) {
      throw new BadRequestException('El vehículo no pertenece al usuario especificado');
    }

    return vehiculo;
  }

  /**
   * Validar que no existen conflictos de reservas en el horario especificado
   */
  private async validarConflictosReservas(
    queryRunner: QueryRunner,
    plazaId: number,
    fechaInicio: Date,
    fechaFin: Date
  ): Promise<void> {
    // Buscar reservas que se solapen en tiempo para la misma plaza
    const reservasConflictivas = await queryRunner.manager
      .createQueryBuilder(Reserva, 'reserva')
      .where('reserva.plaza_id = :plazaId', { plazaId })
      .andWhere('reserva.estado = :estado', { estado: EstadoReservaDTO.ACTIVA })
      .andWhere(
        '(reserva.fecha_inicio < :fechaFin AND reserva.fecha_fin > :fechaInicio)',
        { fechaInicio, fechaFin }
      )
      .getMany();

    if (reservasConflictivas.length > 0) {
      this.logger.warn(
        `Conflicto de reservas detectado para plaza ${plazaId}: ${reservasConflictivas.length} reservas conflictivas`
      );
      
      throw new BadRequestException(
        `La plaza ya está reservada en el horario especificado. ` +
        `Conflictos encontrados: ${reservasConflictivas.map(r => `${r.fecha_inicio} - ${r.fecha_fin}`).join(', ')}`
      );
    }
  }
}