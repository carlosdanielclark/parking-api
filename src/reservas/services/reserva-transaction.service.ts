// src/reservas/services/reserva-transaction.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner, DataSource } from 'typeorm';
import { Reserva, EstadoReservaDTO } from '../../entities/reserva.entity';
import { Plaza, EstadoPlaza } from '../../entities/plaza.entity';
import { User } from '../../entities/user.entity';
import { Vehiculo } from '../../entities/vehiculo.entity';
import { CreateReservaDto } from '../dto/create-reserva.dto';
import { LoggingService } from '../../logging/logging.service';

/**
 * Servicio transaccional que maneja la creación y finalización de reservas
 * Resuelve conflictos de concurrencia y asegura la consistencia de datos
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
   * Crea una nueva reserva en una transacción aislada (SERIALIZABLE)
   * con manejo de bloqueos pesimistas para evitar doble reserva
   */
  async createReservaWithTransaction(
    createReservaDto: CreateReservaDto,
    currentUser: any,
  ): Promise<Reserva> {
    const { plaza_id, vehiculo_id, usuario_id, fecha_inicio, fecha_fin } = createReservaDto;
    this.logger.log(`Iniciando transacción para reserva: Plaza ${plaza_id}, Usuario ${usuario_id}`);

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const inicioDate = new Date(fecha_inicio);
      const finDate = new Date(fecha_fin);

      // Validaciones temporales preliminares antes de transacción
      await this.validateReservationTiming(inicioDate, finDate);

      // Bloquear y validar recursos críticos
      const [plaza, vehiculo, usuario] = await Promise.all([
        this.lockAndValidatePlaza(queryRunner, plaza_id),
        this.lockAndValidateVehiculo(queryRunner, vehiculo_id, usuario_id),
        this.validateUser(queryRunner, usuario_id),
      ]);

      // Verificar conflictos temporales riesgosos para plaza y vehículo
      await this.checkTemporalConflicts(queryRunner, plaza_id, vehiculo_id, inicioDate, finDate);

      // Crear entidad Reserva
      const nuevaReserva = queryRunner.manager.create(Reserva, {
        usuario,
        plaza,
        vehiculo,
        fecha_inicio: inicioDate,
        fecha_fin: finDate,
        estado: EstadoReservaDTO.ACTIVA,
      });

      const reservaGuardada = await queryRunner.manager.save(nuevaReserva);

      // Actualizar estado de plaza a ocupada
      await queryRunner.manager.update(Plaza, plaza_id, { estado: EstadoPlaza.OCUPADA });

      // Confirmar transacción
      await queryRunner.commitTransaction();

      this.logger.log(`Reserva creada con éxito: ID ${reservaGuardada.id}`);

      // Cargar reserva compleja con relaciones para respuesta
      const reservaFinal = await this.reservaRepository.findOne({
        where: { id: reservaGuardada.id },
        relations: ['usuario', 'plaza', 'vehiculo'],
      });

      if (!reservaFinal) {
        throw new BadRequestException('Error interno: reserva creada no encontrada');
      }

      // Registro de evento en log para auditoría
      await this.loggingService.logReservationCreated(
        currentUser.userId,
        reservaFinal.id,
        reservaFinal.plaza.id,
        reservaFinal.vehiculo.id,
        { start: reservaFinal.fecha_inicio, end: reservaFinal.fecha_fin }
      );

      return reservaFinal;

    } catch (error) {
      await queryRunner.rollbackTransaction();

      this.logger.error(`Error creando reserva: ${error.message}`, error.stack);

      // Registrar error crítico en logging
      await this.loggingService.logSystemError(error, {
        operation: 'create_reservation',
        plaza_id,
        vehiculo_id,
        usuario_id,
      }, currentUser.userId);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Error interno al procesar la reserva');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Finaliza una reserva activa y libera la plaza en transacción
   */
  async finalizarReservaWithTransaction(reservaId: string): Promise<Reserva> {
    this.logger.log(`Iniciando finalización de reserva ID ${reservaId}`);

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reserva = await queryRunner.manager.findOne(Reserva, {
        where: { id: reservaId },
        relations: ['plaza'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!reserva) {
        throw new BadRequestException('Reserva no encontrada');
      }

      if (reserva.estado !== EstadoReservaDTO.ACTIVA) {
        throw new BadRequestException('La reserva no está activa');
      }

      // Marcar reserva como finalizada
      reserva.estado = EstadoReservaDTO.FINALIZADA;
      await queryRunner.manager.save(reserva);

      // Liberar plaza asociada
      await queryRunner.manager.update(Plaza, reserva.plaza.id, { estado: EstadoPlaza.LIBRE });

      await queryRunner.commitTransaction();

      this.logger.log(`Reserva ID ${reservaId} finalizada, plaza liberada`);

      return reserva;

    } catch (error) {
      await queryRunner.rollbackTransaction();

      this.logger.error(`Error finalizando reserva ${reservaId}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al finalizar la reserva');
    } finally {
      await queryRunner.release();
    }
  }

  // ----------------------
  // Métodos privados
  // ----------------------

  private async validateReservationTiming(inicioDate: Date, finDate: Date): Promise<void> {
    const ahora = new Date();

    if (inicioDate <= ahora) {
      throw new BadRequestException('La fecha de inicio debe ser futura');
    }

    if (finDate <= inicioDate) {
      throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    const duracionHoras = (finDate.getTime() - inicioDate.getTime()) / (1000 * 3600);
    if (duracionHoras > 24) {
      throw new BadRequestException('La reserva no puede exceder las 24 horas');
    }

    if (inicioDate > new Date(ahora.getTime() + 30 * 24 * 3600 * 1000)) {
      throw new BadRequestException('No se permiten reservas con más de 30 días de anticipación');
    }
  }

  private async lockAndValidatePlaza(queryRunner: QueryRunner, plazaId: number): Promise<Plaza> {
    const plaza = await queryRunner.manager.findOne(Plaza, {
      where: { id: plazaId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!plaza) {
      throw new BadRequestException(`No se encontró la plaza con ID ${plazaId}`);
    }

    if (plaza.estado !== EstadoPlaza.LIBRE) {
      throw new BadRequestException('La plaza no está disponible para reservar');
    }

    return plaza;
  }

  private async lockAndValidateVehiculo(
      queryRunner: QueryRunner, 
      vehiculoId: string, 
      usuarioId: string
  ): Promise<Vehiculo> {
      const vehiculo = await queryRunner.manager
          .createQueryBuilder(Vehiculo, 'vehiculo')
          .innerJoinAndSelect('vehiculo.usuario', 'usuario')
          .where('vehiculo.id = :vehiculoId', { vehiculoId })
          .setLock('pessimistic_read')
          .getOne();

      if (!vehiculo) {
          throw new BadRequestException('Vehículo no encontrado');
      }

      if (vehiculo.usuario.id !== usuarioId) {
          throw new BadRequestException('El vehículo no pertenece al usuario');
      }

      return vehiculo;
  }

  private async validateUser(queryRunner: QueryRunner, usuarioId: string): Promise<User> {
    const usuario = await queryRunner.manager.findOne(User, { where: { id: usuarioId } });

    if (!usuario) {
      throw new BadRequestException(`No se encontró el usuario con ID ${usuarioId}`);
    }

    return usuario;
  }

  private async checkTemporalConflicts(
    queryRunner: QueryRunner,
    plazaId: number,
    vehiculoId: string,
    inicioDate: Date,
    finDate: Date,
  ): Promise<void> {
    // Validar conflicto temporal con plaza
    const conflictoPlaza = await queryRunner.manager.createQueryBuilder(Reserva, 'reserva')
      .setLock('pessimistic_write', undefined) // Lock entire relation
      .where('reserva.plaza_id = :plazaId', { plazaId })
      .andWhere('reserva.estado = :estado', { estado: EstadoReservaDTO.ACTIVA })
      .andWhere('(reserva.fecha_inicio < :finDate AND reserva.fecha_fin > :inicioDate)', { finDate, inicioDate })
      .getOne();

    if (conflictoPlaza) {
      throw new BadRequestException('La plaza está reservada en el rango de fechas indicado');
    }

    // Validar conflicto temporal con vehículo
    const conflictoVehiculo = await queryRunner.manager.createQueryBuilder(Reserva, 'reserva')
      .where('reserva.vehiculo_id = :vehiculoId', { vehiculoId })
      .andWhere('reserva.estado = :estado', { estado: EstadoReservaDTO.ACTIVA })
      .andWhere('(reserva.fecha_inicio < :finDate AND reserva.fecha_fin > :inicioDate)', { finDate, inicioDate })
      .setLock('pessimistic_write')
      .getOne();

    if (conflictoVehiculo) {
      throw new BadRequestException('El vehículo tiene otra reserva activa en el rango de fechas indicado');
    }
  }
}
