// src/reservas/reservas.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards, 
  HttpCode, 
  HttpStatus,
  Logger, 
  UseInterceptors
} from '@nestjs/common';
import { ReservasService } from './reservas.service';
import { CreateReservaDto } from './dto/create-reserva.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import * as getUserDecorator from '../auth/decorators/get-user.decorator';
import { UserRole } from '../entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditInterceptor } from '../logging/audit.interceptor';
import { AuditAction } from '../logging/audit-action.decorator';
import { LogAction } from '../schemas/log.schema';

/**
 * Controlador para la gestión de reservas de parking
 * Implementa el caso de uso principal: reservar plaza de aparcamiento
 * Incluye endpoints para crear, consultar, cancelar y gestionar reservas
 */
@Controller('reservas')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class ReservasController {
  private readonly logger = new Logger(ReservasController.name);

  constructor(private readonly reservasService: ReservasService) {}

  /**
   * Crear una nueva reserva - CASO DE USO PRINCIPAL
   * Endpoint: POST /reservas
   * Acceso: Clientes pueden crear para sí mismos, administradores para cualquiera
   * 
   * @param createReservaDto - Datos de la reserva a crear
   * @param currentUser - Usuario autenticado
   * @returns Reserva creada con detalles completos
   */
  @Post('/')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @AuditAction(LogAction.CREATE_RESERVATION)
  async create(
    @Body() createReservaDto: CreateReservaDto,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de nueva reserva: Plaza ${createReservaDto.plaza_id} por usuario ${currentUser.userId}`);
    
    try {
      const reserva = await this.reservasService.create(createReservaDto, currentUser);
      
      this.logger.log(`Reserva creada exitosamente: ${reserva.id} - Plaza ${reserva.plaza.numero_plaza}`);
      
      return {
        success: true,
        message: 'Reserva creada exitosamente',
        data: reserva,
      };
    } catch (error) {
      this.logger.error(`Error al crear reserva: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener todas las reservas según permisos del usuario
   * Endpoint: GET /reservas
   * Acceso: Todos los usuarios autenticados
   * - Administradores y empleados: ven todas las reservas
   * - Clientes: solo ven sus propias reservas
   * 
   * @param currentUser - Usuario autenticado
   * @returns Lista de reservas según permisos
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser) {
    this.logger.log(`Solicitud de listado de reservas por ${currentUser.userId} (${currentUser.role})`);
    
    try {
      const reservas = await this.reservasService.findAll(currentUser);
      
      this.logger.log(`Se obtuvieron ${reservas.length} reservas para el usuario`);
      
      return {
        success: true,
        message: 'Reservas obtenidas exitosamente',
        data: reservas,
        count: reservas.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener reservas: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener reservas activas en el sistema
   * Endpoint: GET /reservas/activas
   * Acceso: Empleados y administradores
   * Útil para monitoreo operativo del parking
   * 
   * @returns Lista de reservas activas
   */
  @Get('activas')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async findActive() {
    this.logger.log('Solicitud de reservas activas');
    
    try {
      const reservasActivas = await this.reservasService.findActive();
      
      this.logger.log(`Se encontraron ${reservasActivas.length} reservas activas`);
      
      return {
        success: true,
        message: 'Reservas activas obtenidas exitosamente',
        data: reservasActivas,
        count: reservasActivas.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener reservas activas: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener reservas de un usuario específico
   * Endpoint: GET /reservas/usuario/:usuarioId
   * Acceso: El propio usuario, empleados y administradores
   * 
   * @param usuarioId - ID del usuario propietario
   * @param currentUser - Usuario autenticado
   * @returns Lista de reservas del usuario
   */
  @Get('usuario/:usuarioId')
  @HttpCode(HttpStatus.OK)
  async findByUser(
    @Param('usuarioId') usuarioId: string,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de reservas del usuario ${usuarioId} por ${currentUser.userId}`);
    
    try {
      const reservas = await this.reservasService.findByUser(usuarioId, currentUser);
      
      this.logger.log(`Se encontraron ${reservas.length} reservas para el usuario ${usuarioId}`);
      
      return {
        success: true,
        message: `Reservas del usuario obtenidas exitosamente`,
        data: reservas,
        count: reservas.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener reservas del usuario ${usuarioId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener una reserva específica por ID
   * Endpoint: GET /reservas/:id
   * Acceso: El propietario de la reserva, empleados y administradores
   * 
   * @param id - ID de la reserva a buscar
   * @param currentUser - Usuario autenticado
   * @returns Reserva encontrada con detalles completos
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id') id: string,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de reserva específica: ${id} por ${currentUser.userId}`);
    
    try {
      const reserva = await this.reservasService.findOne(id, currentUser);

      this.logger.log(`Reserva encontrada: ${reserva.id}`);
      
      return {
        success: true,
        message: 'Reserva obtenida exitosamente',
        data: reserva,
      };
    } catch (error) {
      this.logger.error(`Error al obtener reserva ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Cancelar una reserva existente
   * Endpoint: POST /reservas/:id/cancelar
   * Acceso: El propietario de la reserva o administradores
   * Libera automáticamente la plaza ocupada
   * 
   * @param id - ID de la reserva a cancelar
   * @param currentUser - Usuario autenticado
   * @returns Reserva cancelada
   */
  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @getUserDecorator.GetUser() currentUser: getUserDecorator.AuthenticatedUser
  ) {
    this.logger.log(`Solicitud de cancelación de reserva ${id} por ${currentUser.userId}`);
    
    try {
      const reserva = await this.reservasService.cancel(id, currentUser);
      
      this.logger.log(`Reserva cancelada exitosamente: ${id} - Plaza ${reserva.plaza.numero_plaza} liberada`);
      
      return {
        success: true,
        message: 'Reserva cancelada exitosamente',
        data: reserva,
      };
    } catch (error) {
      this.logger.error(`Error al cancelar reserva ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Finalizar una reserva (marcar como completada)
   * Endpoint: POST /reservas/:id/finalizar
   * Acceso: Solo administradores
   * Utilizado cuando el cliente completa su estancia
   * 
   * @param id - ID de la reserva a finalizar
   * @returns Reserva finalizada
   */
  @Post(':id/finalizar')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async finish(@Param('id') id: string) {
    this.logger.log(`Solicitud de finalización de reserva ${id}`);
    
    try {
      const reserva = await this.reservasService.finish(id);
      
      this.logger.log(`Reserva finalizada exitosamente: ${id} - Plaza ${reserva.plaza.numero_plaza} liberada`);
      
      return {
        success: true,
        message: 'Reserva finalizada exitosamente',
        data: reserva,
      };
    } catch (error) {
      this.logger.error(`Error al finalizar reserva ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
