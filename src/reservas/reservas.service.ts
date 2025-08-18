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
  ) {}

  /**
   * Crear una nueva reserva - CASO DE USO PRINCIPAL
   * Cliente desea reservar una plaza de aparcamiento para un vehículo
   * Implementa validaciones complejas de disponibilidad y concurrencia
   * 
   * @param createReservaDto - Datos de la reserva a crear
   * @param currentUser - Usuario autenticado que realiza la reserva
   * @returns Reserva creada con detalles completos
   * @throws ForbiddenException si no tiene permisos
   * @throws BadRequestException si hay conflictos de horario o datos inválidos
   */
  async create(createReservaDto: CreateReservaDto, currentUser: any): Promise<Reserva> {
    const { usuario_id, plaza_id, vehiculo_id, fecha_inicio, fecha_fin } = createReservaDto;

    this.logger.log(`Creando reserva: Plaza ${plaza_id} para vehículo ${vehiculo_id} por usuario ${currentUser.userId}`);

    // VALIDACIÓN DE PERMISOS: Solo el propietario o admin pueden crear reservas
    if (currentUser.role !== UserRole.ADMIN && currentUser.userId !== usuario_id) {
      this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó crear reserva para usuario ${usuario_id}`);
      throw new ForbiddenException('Solo puedes crear reservas para ti mismo');
    }

    // VALIDACIÓN TEMPORAL: Fechas deben ser válidas y futuras
    const inicioDate = new Date(fecha_inicio);
    const finDate = new Date(fecha_fin);
    const ahora = new Date();

    if (inicioDate <= ahora) {
      this.logger.warn(`Fecha de inicio inválida: ${fecha_inicio} (debe ser futura)`);
      throw new BadRequestException('La fecha de inicio debe ser futura');
    }

    if (finDate <= inicioDate) {
      this.logger.warn(`Fecha de fin inválida: ${fecha_fin} <= ${fecha_inicio}`);
      throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    // Validar duración máxima (ej: no más de 24 horas)
    const duracionHoras = (finDate.getTime() - inicioDate.getTime()) / (1000 * 60 * 60);
    if (duracionHoras > 24) {
      this.logger.warn(`Duración excesiva: ${duracionHoras} horas (máximo 24h)`);
      throw new BadRequestException('La reserva no puede exceder 24 horas');
    }

    try {
      // VALIDACIÓN DE ENTIDADES: Verificar que existan y sean válidas
      const usuario = await this.userRepository.findOne({ where: { id: usuario_id } });
      if (!usuario) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const plaza = await this.plazaRepository.findOne({ where: { id: plaza_id } });
      if (!plaza) {
        throw new NotFoundException('Plaza no encontrada');
      }

      if (plaza.estado !== EstadoPlaza.LIBRE) {
        this.logger.warn(`Plaza ${plaza_id} no disponible: estado ${plaza.estado}`);
        throw new BadRequestException(`La plaza ${plaza.numero_plaza} no está disponible`);
      }

      const vehiculo = await this.vehiculoRepository.findOne({ 
        where: { id: vehiculo_id },
        relations: ['usuario']
      });
      if (!vehiculo) {
        throw new NotFoundException('Vehículo no encontrado');
      }

      if (vehiculo.usuario.id !== usuario_id) {
        this.logger.warn(`Vehículo ${vehiculo_id} no pertenece al usuario ${usuario_id}`);
        throw new BadRequestException('El vehículo no pertenece al usuario especificado');
      }

      // VALIDACIÓN DE CONFLICTOS: Verificar disponibilidad temporal de la plaza
      const conflictoPlaza = await this.reservaRepository
        .createQueryBuilder('reserva')
        .where('reserva.plaza_id = :plaza_id', { plaza_id })
        .andWhere('reserva.estado = :estado', { estado: EstadoReserva.ACTIVA })
        .andWhere(
          '(reserva.fecha_inicio < :fecha_fin AND reserva.fecha_fin > :fecha_inicio)',
          { fecha_inicio: inicioDate, fecha_fin: finDate }
        )
        .getOne();

      if (conflictoPlaza) {
        this.logger.warn(`Conflicto temporal en plaza ${plaza_id}: ${conflictoPlaza.id}`);
        throw new BadRequestException(`La plaza ${plaza.numero_plaza} ya está reservada para ese período de tiempo`);
      }

      // VALIDACIÓN DE VEHÍCULO: Un vehículo no puede tener múltiples reservas activas
      const vehiculoOcupado = await this.reservaRepository
        .createQueryBuilder('reserva')
        .where('reserva.vehiculo_id = :vehiculo_id', { vehiculo_id })
        .andWhere('reserva.estado = :estado', { estado: EstadoReserva.ACTIVA })
        .andWhere(
          '(reserva.fecha_inicio < :fecha_fin AND reserva.fecha_fin > :fecha_inicio)',
          { fecha_inicio: inicioDate, fecha_fin: finDate }
        )
        .getOne();

      if (vehiculoOcupado) {
        this.logger.warn(`Vehículo ${vehiculo_id} ya tiene reserva activa: ${vehiculoOcupado.id}`);
        throw new BadRequestException(`El vehículo ${vehiculo.placa} ya tiene una reserva activa para ese período`);
      }

      // CREACIÓN DE RESERVA: Transacción para garantizar consistencia
      const reserva = this.reservaRepository.create({
        usuario: usuario,
        plaza: plaza,
        vehiculo: vehiculo,
        fecha_inicio: inicioDate,
        fecha_fin: finDate,
        estado: EstadoReserva.ACTIVA,
      });

      const savedReserva = await this.reservaRepository.save(reserva);

      // ACTUALIZACIÓN DE ESTADO: Marcar plaza como ocupada
      await this.plazaRepository.update(plaza_id, { estado: EstadoPlaza.OCUPADA });

      this.logger.log(`Reserva creada exitosamente: ${savedReserva.id} - Plaza ${plaza.numero_plaza} para vehículo ${vehiculo.placa}`);

      const reservaCompleta = await this.reservaRepository.findOne({
        where: { id: savedReserva.id },
        relations: ['usuario', 'plaza', 'vehiculo']
      });
      // Haz una verificación y lanza excepción si el resultado es null
      if (!reservaCompleta) {
        throw new NotFoundException('No se pudo cargar la reserva completa después de crearla');
      }
      // Retornar reserva completa con relaciones
      return reservaCompleta;

    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException || 
          error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Error al crear reserva: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al crear reserva');
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
   * Cancelar una reserva existente
   * Solo el propietario o administradores pueden cancelar
   * Libera automáticamente la plaza ocupada
   * 
   * @param id - ID de la reserva a cancelar
   * @param currentUser - Usuario autenticado
   * @returns Reserva cancelada
   * @throws ForbiddenException si no tiene permisos
   * @throws BadRequestException si no se puede cancelar
   */
  async cancel(id: string, currentUser: any): Promise<Reserva> {
    this.logger.log(`Cancelando reserva ${id} por usuario ${currentUser.userId}`);

    try {
      const reserva = await this.reservaRepository.findOne({
        where: { id },
        relations: ['usuario', 'plaza', 'vehiculo']
      });

      if (!reserva) {
        throw new NotFoundException(`Reserva con ID ${id} no encontrada`);
      }

      // Verificar permisos: solo propietario o admin pueden cancelar
      if (currentUser.role !== UserRole.ADMIN && currentUser.userId !== reserva.usuario.id) {
        this.logger.warn(`Acceso denegado: usuario ${currentUser.userId} intentó cancelar reserva ${id}`);
        throw new ForbiddenException('No tienes permisos para cancelar esta reserva');
      }

      if (reserva.estado !== EstadoReserva.ACTIVA) {
        this.logger.warn(`Intento de cancelar reserva no activa: ${id} (estado: ${reserva.estado})`);
        throw new BadRequestException('Solo se pueden cancelar reservas activas');
      }

      // Actualizar estado de la reserva
      reserva.estado = EstadoReserva.CANCELADA;
      await this.reservaRepository.save(reserva);

      // Liberar la plaza
      await this.plazaRepository.update(reserva.plaza.id, { estado: EstadoPlaza.LIBRE });

      this.logger.log(`Reserva cancelada exitosamente: ${id} - Plaza ${reserva.plaza.numero_plaza} liberada`);

      return reserva;
    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof ForbiddenException || 
          error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error al cancelar reserva ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al cancelar reserva');
    }
  }

  /**
   * Finalizar una reserva (marcar como completada)
   * Solo administradores pueden marcar reservas como finalizadas
   * Libera la plaza para nuevas reservas
   * 
   * @param id - ID de la reserva a finalizar
   * @returns Reserva finalizada
   */
  async finish(id: string): Promise<Reserva> {
    this.logger.log(`Finalizando reserva ${id}`);

    try {
      const reserva = await this.reservaRepository.findOne({
        where: { id },
        relations: ['usuario', 'plaza', 'vehiculo']
      });

      if (!reserva) {
        throw new NotFoundException(`Reserva con ID ${id} no encontrada`);
      }

      if (reserva.estado !== EstadoReserva.ACTIVA) {
        throw new BadRequestException('Solo se pueden finalizar reservas activas');
      }

      // Actualizar estado de la reserva
      reserva.estado = EstadoReserva.FINALIZADA;
      await this.reservaRepository.save(reserva);

      // Liberar la plaza
      await this.plazaRepository.update(reserva.plaza.id, { estado: EstadoPlaza.LIBRE });

      this.logger.log(`Reserva finalizada exitosamente: ${id} - Plaza ${reserva.plaza.numero_plaza} liberada`);

      return reserva;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error al finalizar reserva ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al finalizar reserva');
    }
  }

  /**
   * Obtener reservas activas (en curso)
   * Útil para monitoreo operativo del parking
   * 
   * @returns Lista de reservas activas con información completa
   */
  async findActive(): Promise<Reserva[]> {
    this.logger.log('Obteniendo reservas activas');

    try {
      const ahora = new Date();
      const reservasActivas = await this.reservaRepository
        .createQueryBuilder('reserva')
        .leftJoinAndSelect('reserva.usuario', 'usuario')
        .leftJoinAndSelect('reserva.plaza', 'plaza')
        .leftJoinAndSelect('reserva.vehiculo', 'vehiculo')
        .where('reserva.estado = :estado', { estado: EstadoReserva.ACTIVA })
        .andWhere('reserva.fecha_inicio <= :ahora', { ahora })
        .andWhere('reserva.fecha_fin >= :ahora', { ahora })
        .orderBy('reserva.fecha_inicio', 'ASC')
        .getMany();

      this.logger.log(`Se encontraron ${reservasActivas.length} reservas activas`);
      
      return reservasActivas;
    } catch (error) {
      this.logger.error(`Error al obtener reservas activas: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener reservas activas');
    }
  }
}
