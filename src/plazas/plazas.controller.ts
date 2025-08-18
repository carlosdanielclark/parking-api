// src/plazas/plazas.controller.ts

import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  Query, 
  HttpCode, 
  HttpStatus,
  Logger,
  ParseIntPipe
} from '@nestjs/common';
import { PlazasService } from './plazas.service';
import { CreatePlazaDto } from './dto/create-plaza.dto';
import { UpdatePlazaDto } from './dto/update-plaza.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { EstadoPlaza, TipoPlaza } from '../entities/plaza.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Controlador para la gestión de plazas de parking
 * Implementa endpoints REST para operaciones CRUD de plazas
 * Incluye endpoint especial para consulta de ocupación (caso de uso principal)
 */
@Controller('plazas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlazasController {
  private readonly logger = new Logger(PlazasController.name);

  constructor(private readonly plazasService: PlazasService) {}

  /**
   * Crear una nueva plaza
   * Endpoint: POST /plazas
   * Acceso: Solo administradores
   * 
   * @param createPlazaDto - Datos de la plaza a crear
   * @returns Plaza creada con mensaje de éxito
   */
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createPlazaDto: CreatePlazaDto) {
    this.logger.log(`Solicitud de creación de plaza: ${createPlazaDto.numero_plaza}`);
    
    try {
      const plaza = await this.plazasService.create(createPlazaDto);
      
      this.logger.log(`Plaza creada exitosamente: ${plaza.numero_plaza}`);
      
      return {
        success: true,
        message: 'Plaza creada exitosamente',
        data: plaza,
      };
    } catch (error) {
      this.logger.error(`Error al crear plaza: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener todas las plazas con filtros opcionales
   * Endpoint: GET /plazas?estado=libre&tipo=normal
   * Acceso: Administradores y empleados
   * 
   * @param estado - Filtro opcional por estado
   * @param tipo - Filtro opcional por tipo
   * @returns Lista de plazas filtradas
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('estado') estado?: EstadoPlaza,
    @Query('tipo') tipo?: TipoPlaza
  ) {
    this.logger.log(`Solicitud de listado de plazas${estado ? ` - estado: ${estado}` : ''}${tipo ? ` - tipo: ${tipo}` : ''}`);
    
    try {
      let plazas;
      let message = 'Plazas obtenidas exitosamente';

      if (estado && tipo) {
        // Combinar filtros (implementar si es necesario)
        plazas = await this.plazasService.findAll();
        plazas = plazas.filter(p => p.estado === estado && p.tipo === tipo);
        message = `Plazas con estado ${estado} y tipo ${tipo} obtenidas exitosamente`;
      } else if (estado) {
        plazas = await this.plazasService.findByEstado(estado);
        message = `Plazas con estado ${estado} obtenidas exitosamente`;
      } else if (tipo) {
        plazas = await this.plazasService.findByTipo(tipo);
        message = `Plazas de tipo ${tipo} obtenidas exitosamente`;
      } else {
        plazas = await this.plazasService.findAll();
      }

      this.logger.log(`Se obtuvieron ${plazas.length} plazas`);

      return {
        success: true,
        message,
        data: plazas,
        count: plazas.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener plazas: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de ocupación del parking
   * Endpoint: GET /plazas/ocupacion
   * Acceso: Administradores y empleados
   * Caso de uso principal: consulta de ocupación por empleados
   * 
   * @returns Estadísticas detalladas de ocupación
   */
  @Get('ocupacion')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  @HttpCode(HttpStatus.OK)
  async getOcupacion() {
    this.logger.log('Solicitud de consulta de ocupación del parking');
    
    try {
      const ocupacion = await this.plazasService.getOcupacion();
      
      this.logger.log(`Ocupación consultada - Total: ${ocupacion.total}, Ocupadas: ${ocupacion.ocupadas}, Libres: ${ocupacion.libres}`);
      
      return {
        success: true,
        message: 'Estadísticas de ocupación obtenidas exitosamente',
        data: ocupacion,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error al obtener ocupación: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener plazas disponibles para reserva
   * Endpoint: GET /plazas/disponibles?tipo=electrico
   * Acceso: Todos los usuarios autenticados
   * 
   * @param tipo - Tipo específico de plaza (opcional)
   * @returns Lista de plazas disponibles
   */
  @Get('disponibles')
  @HttpCode(HttpStatus.OK)
  async findAvailable(@Query('tipo') tipo?: TipoPlaza) {
    this.logger.log(`Solicitud de plazas disponibles${tipo ? ` de tipo ${tipo}` : ''}`);
    
    try {
      const plazasDisponibles = await this.plazasService.findAvailable(tipo);
      
      this.logger.log(`Se encontraron ${plazasDisponibles.length} plazas disponibles`);
      
      return {
        success: true,
        message: `Plazas disponibles${tipo ? ` de tipo ${tipo}` : ''} obtenidas exitosamente`,
        data: plazasDisponibles,
        count: plazasDisponibles.length,
      };
    } catch (error) {
      this.logger.error(`Error al obtener plazas disponibles: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtener una plaza específica por ID
   * Endpoint: GET /plazas/:id
   * Acceso: Todos los usuarios autenticados
   * 
   * @param id - ID de la plaza a buscar
   * @returns Plaza encontrada con detalles completos
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Solicitud de plaza específica: ${id}`);
    
    try {
      const plaza = await this.plazasService.findOne(id);
      
      this.logger.log(`Plaza encontrada: ${plaza.numero_plaza}`);
      
      return {
        success: true,
        message: 'Plaza obtenida exitosamente',
        data: plaza,
      };
    } catch (error) {
      this.logger.error(`Error al obtener plaza ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Actualizar una plaza existente
   * Endpoint: PATCH /plazas/:id
   * Acceso: Solo administradores
   * 
   * @param id - ID de la plaza a actualizar
   * @param updatePlazaDto - Datos a actualizar
   * @returns Plaza actualizada
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number, 
    @Body() updatePlazaDto: UpdatePlazaDto
  ) {
    this.logger.log(`Solicitud de actualización de plaza: ${id}`);
    
    try {
      const plaza = await this.plazasService.update(id, updatePlazaDto);
      
      this.logger.log(`Plaza actualizada exitosamente: ${plaza.numero_plaza}`);
      
      return {
        success: true,
        message: 'Plaza actualizada exitosamente',
        data: plaza,
      };
    } catch (error) {
      this.logger.error(`Error al actualizar plaza ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Eliminar una plaza
   * Endpoint: DELETE /plazas/:id
   * Acceso: Solo administradores
   * 
   * @param id - ID de la plaza a eliminar
   * @returns Confirmación de eliminación
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Solicitud de eliminación de plaza: ${id}`);
    
    try {
      await this.plazasService.remove(id);
      
      this.logger.log(`Plaza eliminada exitosamente: ${id}`);
      
      return {
        success: true,
        message: 'Plaza eliminada exitosamente',
      };
    } catch (error) {
      this.logger.error(`Error al eliminar plaza ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
