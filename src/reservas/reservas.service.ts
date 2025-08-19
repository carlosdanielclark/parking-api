// src/reservas/reservas.service.ts

import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reserva, EstadoReserva } from '../entities/reserva.entity';
import { Plaza, EstadoPlaza } from '../entities/plaza.entity';
import { User, UserRole } from '../entities/user.entity';
import { Vehiculo } from '../entities/vehiculo.entity';
import { CreateReservaDto } from './dto/create-reserva.dto';
import { UpdateReservaDto } from './dto/update-reserva.dto';
import { ReservaTransactionService } from './services/reserva-transaction.service';
import { LoggingService } from '../logging/logging.service';

/**
 * Servicio para la gestión completa de reservas de parking
 * Implementa el caso de uso principal: reservar plaza de aparcamiento
 * Maneja lógica compleja de concurrencia y validaciones de negocio
 */
@Injectable()
export class ReservasService {
  private readonly logger = new Logger(ReservasService.name);

  constructor(
    @InjectRepository(Reserva)
    private readonly reservaRepository: Repository<Reserva>,
    @InjectRepository(Plaza)
    private readonly plazaRepository: Repository<Plaza>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Vehiculo)
    private readonly vehiculoRepository: Repository<Vehiculo>,
    private readonly reservaTransactionService: ReservaTransactionService,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Crear nueva reserva - CASO DE USO PRINCIPAL
   * Delega la lógica transaccional al servicio especializado
   * Realiza validaciones previas de permisos y formato
   * 
   * @param createReservaDto - Datos de la reserva a crear
   * @param currentUser - Usuario autenticado
   * @returns Reserva creada con relaciones completas
   */
  async create(createReservaDto: CreateReservaDto, currentUser: any): Promise<Reserva> {
    const { usuario_id } = createReservaDto;

    this.logger.log(`Solicitud de reserva: Plaza ${createReservaDto.plaza_id} por usuario ${currentUser.userId}`);

    // 1. Validar permisos: solo admin o el propio usuario pueden crear reservas para ese usuario
    if (currentUser.role !== UserRole.ADMIN && currentUser.userId !== usuario_id) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó crear reserva para usuario ${usuario_id}`);
      throw new ForbiddenException('Solo puedes crear reservas para ti mismo');
    }

    // 2. Validar formatos y lógica de fechas
    const inicioDate = new Date(createReservaDto.fecha_inicio);
    const finDate = new Date(createReservaDto.fecha_fin);
    const ahora = new Date();

    if (isNaN(inicioDate.getTime()) || isNaN(finDate.getTime())) {
      this.logger.warn('Fechas inválidas en la solicitud de reserva');
      throw new BadRequestException('Las fechas proporcionadas no son válidas');
    }

    if (inicioDate <= ahora) {
      this.logger.warn(`Fecha de inicio inválida: ${createReservaDto.fecha_inicio} (debe ser futura)`);
      throw new BadRequestException('La fecha de inicio debe ser futura');
    }

    if (finDate <= inicioDate) {
      this.logger.warn(`Fecha de fin inválida: ${createReservaDto.fecha_fin} <= ${createReservaDto.fecha_inicio}`);
      throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    const duracionHoras = (finDate.getTime() - inicioDate.getTime()) / (1000 * 60 * 60);
    if (duracionHoras > 24) {
      this.logger.warn(`Duración excesiva: ${duracionHoras} horas (máximo 24h)`);
      throw new BadRequestException('La reserva no puede exceder 24 horas');
    }

    // 3. Delegar toda lógica compleja, transaccional y validación con concurrencia al servicio transaccional
    try {
      const reservaCreada = await this.reservaTransactionService.createReservaWithTransaction(
        createReservaDto, 
        currentUser
      );

      this.logger.log(`Reserva creada exitosamente: ${reservaCreada.id} - Plaza ${reservaCreada.plaza.numero_plaza}`);
      
      return reservaCreada;
    } catch (error) {
      this.logger.error(`Error al crear reserva: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener todas las reservas según permisos del usuario
   * Administradores y empleados: ven todas las reservas
   * Clientes: solo ven sus propias reservas
   * 
   * @param currentUser - Usuario autenticado
   * @returns Lista de reservas según permisos
   */
  async findAll(currentUser: any): Promise<Reserva[]> {
    this.logger.log(`Obteniendo reservas para usuario ${currentUser.userId} (${currentUser.role})`);

    try {
      let reservas: Reserva[];

      if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.EMPLEADO) {
        // Administradores y empleados ven todas las reservas
        reservas = await this.reservaRepository.find({
          relations: ['usuario', 'plaza', 'vehiculo'],
          order: { created_at: 'DESC' }
        });
      } else {
        // Clientes solo ven sus propias reservas
        reservas = await this.reservaRepository.find({
          where: { usuario: { id: currentUser.userId } },
          relations: ['usuario', 'plaza', 'vehiculo'],
          order: { created_at: 'DESC' }
        });
      }

      this.logger.log(`Se encontraron ${reservas.length} reservas para el usuario`);
      
      return reservas;
    } catch (error) {
      this.logger.error(`Error al obtener reservas: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener reservas');
    }
  }

  /**
   * Obtener reservas de un usuario específico
   * Solo accesible por el propio usuario, empleados y administradores
   * 
   * @param usuarioId - ID del usuario propietario
   * @param currentUser - Usuario autenticado
   * @returns Lista de reservas del usuario
   */
  async findByUser(usuarioId: string, currentUser: any): Promise<Reserva[]> {
    this.logger.log(`Obteniendo reservas del usuario ${usuarioId} por ${currentUser.userId}`);

    // Verificar permisos
    if (currentUser.role === UserRole.CLIENTE && currentUser.userId !== usuarioId) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó ver reservas del usuario ${usuarioId}`);
      throw new ForbiddenException('Solo puedes ver tus propias reservas');
    }

    try {
      const reservas = await this.reservaRepository.find({
        where: { usuario: { id: usuarioId } },
        relations: ['usuario', 'plaza', 'vehiculo'],
        order: { created_at: 'DESC' }
      });

      this.logger.log(`Se encontraron ${reservas.length} reservas para el usuario ${usuarioId}`);
      
      return reservas;
    } catch (error) {
      this.logger.error(`Error al obtener reservas del usuario ${usuarioId}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener reservas del usuario');
    }
  }

  /**
   * Obtener reservas activas en el sistema
   * Para monitoreo operativo por empleados y administradores
   * 
   * @returns Lista de reservas activas
   */
  async findActive(): Promise<Reserva[]> {
    this.logger.log('Obteniendo reservas activas del sistema');

    try {
      const reservasActivas = await this.reservaRepository.find({
        where: { estado: EstadoReserva.ACTIVA },
        relations: ['usuario', 'plaza', 'vehiculo'],
        order: { fecha_inicio: 'ASC' }
      });

      this.logger.log(`Se encontraron ${reservasActivas.length} reservas activas`);
      
      return reservasActivas;
    } catch (error) {
      this.logger.error(`Error al obtener reservas activas: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener reservas activas');
    }
  }

  /**
   * Cancelar reserva existente
   * Delega la lógica transaccional al servicio especializado
   * 
   * @param id - ID de la reserva a cancelar
   * @param currentUser - Usuario autenticado
   * @returns Reserva cancelada
   */
  async cancel(id: string, currentUser: any): Promise<Reserva> {
    this.logger.log(`Cancelando reserva ${id} por usuario ${currentUser.userId}`);

    try {
      const reservaCancelada = await this.reservaTransactionService.cancelReservaWithTransaction(
        id, 
        currentUser
      );

      this.logger.log(`Reserva cancelada exitosamente: ${id}`);
      
      return reservaCancelada;
    } catch (error) {
      this.logger.error(`Error al cancelar reserva ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Finalizar reserva (marcar como completada)
   * Solo accesible por administradores
   * 
   * @param id - ID de la reserva a finalizar
   * @returns Reserva finalizada
   */
  async finish(id: string): Promise<Reserva> {
    this.logger.log(`Finalizando reserva ${id}`);

    try {
      const reservaFinalizada = await this.reservaTransactionService.finishReservaWithTransaction(id);

      this.logger.log(`Reserva finalizada exitosamente: ${id}`);
      
      return reservaFinalizada;
    } catch (error) {
      this.logger.error(`Error al finalizar reserva ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
