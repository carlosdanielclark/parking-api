import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner, DataSource } from 'typeorm';
import { Reserva, EstadoReserva } from '../../entities/reserva.entity';
import { Plaza, EstadoPlaza } from '../../entities/plaza.entity';
import { User } from '../../entities/user.entity';
import { Vehiculo } from '../../entities/vehiculo.entity';
import { CreateReservaDto } from '../dto/create-reserva.dto';
import { LoggingService } from '../../logging/logging.service';

/**
 * ✅ CORREGIDO: Todas las dependencias e importaciones validadas
 * Servicio especializado para operaciones transaccionales de reservas
 * Maneja concurrencia y garantiza consistencia de datos
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
   * ✅ MEJORADO: Método principal con logging integrado
   */
  async createReservaWithTransaction(
    createReservaDto: CreateReservaDto, 
    currentUser: any
  ): Promise<Reserva> {
    const { plaza_id, vehiculo_id, usuario_id, fecha_inicio, fecha_fin } = createReservaDto;
    this.logger.log(`Iniciando transacción de reserva: Plaza ${plaza_id} para usuario ${usuario_id}`);

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');
    
    try {
      const inicioDate = new Date(fecha_inicio);
      const finDate = new Date(fecha_fin);

      // Validaciones previas a la transacción
      await this.validateReservationTiming(inicioDate, finDate);
      
      // Obtener y bloquear recursos críticos
      const [plaza, vehiculo, usuario] = await Promise.all([
        this.lockAndValidatePlaza(queryRunner, plaza_id),
        this.lockAndValidateVehiculo(queryRunner, vehiculo_id, usuario_id),
        this.validateUser(queryRunner, usuario_id)
      ]);
      
      // Verificar conflictos temporales
      await this.checkTemporalConflicts(
        queryRunner, 
        plaza_id, 
        vehiculo_id, 
        inicioDate, 
        finDate
      );
      
      // Crear reserva
      const nuevaReserva = queryRunner.manager.create(Reserva, {
        usuario: usuario,
        plaza: plaza,
        vehiculo: vehiculo,
        fecha_inicio: inicioDate,
        fecha_fin: finDate,
        estado: EstadoReserva.ACTIVA,
      });
      
      const reservaGuardada = await queryRunner.manager.save(Reserva, nuevaReserva);

      // Actualizar estado de la plaza
      await queryRunner.manager.update(Plaza, plaza_id, { 
        estado: EstadoPlaza.OCUPADA 
      });

      await queryRunner.commitTransaction();
      this.logger.log(`Reserva creada exitosamente: ${reservaGuardada.id} - Plaza ${plaza.numero_plaza}`);

      // Recuperar reserva completa con relaciones
      const reserva = await this.reservaRepository.findOne({
        where: { id: reservaGuardada.id },
        relations: ['usuario', 'plaza', 'vehiculo']
      });
      
      if (!reserva) {
        throw new BadRequestException('Error interno: no se encontró la reserva creada');
      }

      // ✅ AGREGADO: Logging de la reserva creada
      await this.loggingService.logReservationCreated(
        currentUser.userId,
        reserva.id,
        reserva.plaza.id,
        reserva.vehiculo.id,
        { inicio: reserva.fecha_inicio, fin: reserva.fecha_fin }
      );
      
      return reserva;
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error en transacción de reserva: ${error.message}`, error.stack);
      
      // ✅ AGREGADO: Logging de errores del sistema
      await this.loggingService.logSystemError(error, {
        operation: 'create_reservation',
        plaza_id,
        vehiculo_id,
        usuario_id
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
   * ✅ AGREGADO: Método para finalizar reservas con transacción
   */
  async finalizarReservaWithTransaction(reservaId: string): Promise<Reserva> {
    this.logger.log(`Finalizando reserva: ${reservaId}`);
    
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
      
      if (reserva.estado !== EstadoReserva.ACTIVA) {
        throw new BadRequestException('La reserva ya no está activa');
      }

      // Finalizar reserva y liberar plaza
      reserva.estado = EstadoReserva.FINALIZADA;
      await queryRunner.manager.save(Reserva, reserva);
      
      await queryRunner.manager.update(Plaza, reserva.plaza.id, {
        estado: EstadoPlaza.LIBRE
      });

      await queryRunner.commitTransaction();
      this.logger.log(`Reserva finalizada exitosamente: ${reservaId} - Plaza ${reserva.plaza.numero_plaza} liberada`);
      
      return reserva;
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al finalizar reserva ${reservaId}: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error interno al finalizar reserva');
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================
  // MÉTODOS PRIVADOS DE VALIDACIÓN
  // ===============================

  private async validateReservationTiming(inicioDate: Date, finDate: Date): Promise<void> {
    const ahora = new Date();
    
    if (inicioDate <= ahora) {
      throw new BadRequestException('La fecha de inicio debe ser futura');
    }
    
    if (finDate <= inicioDate) {
      throw new BadRequestException('La fecha de fin debe ser posterior a inicio');
    }
    
    const duracion = (finDate.getTime() - inicioDate.getTime()) / 3600000;
    if (duracion > 24) {
      throw new BadRequestException('La reserva no puede exceder 24 horas');
    }
    
    if (inicioDate > new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000)) {
      throw new BadRequestException('No se pueden hacer reservas con más de 30 días de anticipación');
    }
  }
  
  private async lockAndValidatePlaza(queryRunner: QueryRunner, plazaId: number): Promise<Plaza> {
    const plaza = await queryRunner.manager.findOne(Plaza, { 
      where: { id: plazaId }, 
      lock: { mode: 'pessimistic_write' } 
    });
    
    if (!plaza) {
      throw new BadRequestException('Plaza no encontrada');
    }
    
    if (plaza.estado !== EstadoPlaza.LIBRE) {
      throw new BadRequestException('Plaza no disponible');
    }
    
    return plaza;
  }

  private async lockAndValidateVehiculo(queryRunner: QueryRunner, vehiculoId: string, usuarioId: string): Promise<Vehiculo> {
    const vehiculo = await queryRunner.manager.findOne(Vehiculo, { 
      where: { id: vehiculoId }, 
      relations: ['usuario'], 
      lock: { mode: 'pessimistic_read' } 
    });
    
    if (!vehiculo) {
      throw new BadRequestException('Vehículo no encontrado');
    }
    
    if (vehiculo.usuario.id !== usuarioId) {
      throw new BadRequestException('El vehículo no pertenece al usuario');
    }
    
    return vehiculo;
  }

  private async validateUser(queryRunner: QueryRunner, usuarioId: string): Promise<User> {
    const usuario = await queryRunner.manager.findOne(User, { 
      where: { id: usuarioId } 
    });
    
    if (!usuario) {
      throw new BadRequestException('Usuario no encontrado');
    }
    
    return usuario;
  }

  private async checkTemporalConflicts(
    queryRunner: QueryRunner, 
    plazaId: number, 
    vehiculoId: string, 
    inicioDate: Date, 
    finDate: Date
  ): Promise<void> {
    // Verificar conflicto de plaza
    const conflictoPlaza = await queryRunner.manager
      .createQueryBuilder(Reserva, 'reserva')
      .where('reserva.plaza_id = :plazaId', { plazaId })
      .andWhere('reserva.estado = :estado', { estado: EstadoReserva.ACTIVA })
      .andWhere('(reserva.fecha_inicio < :finDate AND reserva.fecha_fin > :inicioDate)', 
        { inicioDate, finDate })
      .setLock('pessimistic_write')
      .getOne();
    
    if (conflictoPlaza) {
      throw new BadRequestException('La plaza ya está reservada para ese período');
    }

    // Verificar conflicto de vehículo
    const conflictoVehiculo = await queryRunner.manager
      .createQueryBuilder(Reserva, 'reserva')
      .where('reserva.vehiculo_id = :vehiculoId', { vehiculoId })
      .andWhere('reserva.estado = :estado', { estado: EstadoReserva.ACTIVA })
      .andWhere('(reserva.fecha_inicio < :finDate AND reserva.fecha_fin > :inicioDate)', 
        { inicioDate, finDate })
      .setLock('pessimistic_write')
      .getOne();
    
    if (conflictoVehiculo) {
      throw new BadRequestException('El vehículo ya tiene una reserva activa para ese período');
    }
  }
}