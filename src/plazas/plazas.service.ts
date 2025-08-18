// src/plazas/plazas.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plaza, EstadoPlaza, TipoPlaza } from '../entities/plaza.entity';
import { CreatePlazaDto } from './dto/create-plaza.dto';
import { UpdatePlazaDto } from './dto/update-plaza.dto';

/**
 * Servicio para la gestión completa de plazas de parking
 * Implementa operaciones CRUD con validaciones de negocio
 * Maneja la lógica de estados y disponibilidad de plazas
 */
@Injectable()
export class PlazasService {
  private readonly logger = new Logger(PlazasService.name);

  constructor(
    @InjectRepository(Plaza)
    private readonly plazaRepository: Repository<Plaza>,
  ) {}

  /**
   * Crear una nueva plaza de parking
   * Solo accesible por administradores
   * Valida que el número de plaza sea único en el sistema
   * 
   * @param createPlazaDto - Datos de la plaza a crear
   * @returns Plaza creada
   * @throws BadRequestException si el número de plaza ya existe
   */
  async create(createPlazaDto: CreatePlazaDto): Promise<Plaza> {
    const { numero_plaza } = createPlazaDto;

    this.logger.log(`Creando nueva plaza: ${numero_plaza}`);

    // Verificar que el número de plaza sea único
    const existingPlaza = await this.plazaRepository.findOne({ 
      where: { numero_plaza } 
    });
    
    if (existingPlaza) {
      this.logger.warn(`Intento de crear plaza duplicada: ${numero_plaza}`);
      throw new BadRequestException(`La plaza ${numero_plaza} ya existe en el sistema`);
    }

    try {
      // Crear nueva plaza con valores por defecto
      const plaza = this.plazaRepository.create({
        ...createPlazaDto,
        estado: createPlazaDto.estado || EstadoPlaza.LIBRE,
        tipo: createPlazaDto.tipo || TipoPlaza.NORMAL,
      });

      const savedPlaza = await this.plazaRepository.save(plaza);
      
      this.logger.log(`Plaza creada exitosamente: ${savedPlaza.numero_plaza} (ID: ${savedPlaza.id})`);
      
      return savedPlaza;
    } catch (error) {
      this.logger.error(`Error al crear plaza ${numero_plaza}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al crear plaza');
    }
  }

  /**
   * Obtener todas las plazas del sistema
   * Accesible por administradores y empleados
   * Incluye información de reservas relacionadas
   * 
   * @returns Lista completa de plazas
   */
  async findAll(): Promise<Plaza[]> {
    this.logger.log('Obteniendo todas las plazas');

    try {
      const plazas = await this.plazaRepository.find({
        relations: ['reservas'],
        order: { numero_plaza: 'ASC' }
      });
      
      this.logger.log(`Se encontraron ${plazas.length} plazas`);
      
      return plazas;
    } catch (error) {
      this.logger.error(`Error al obtener plazas: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener plazas');
    }
  }

  /**
   * Obtener una plaza específica por ID
   * Accesible por todos los roles autenticados
   * 
   * @param id - ID de la plaza a buscar
   * @returns Plaza encontrada con sus reservas
   * @throws NotFoundException si la plaza no existe
   */
  async findOne(id: number): Promise<Plaza> {
    this.logger.log(`Buscando plaza con ID: ${id}`);

    try {
      const plaza = await this.plazaRepository.findOne({ 
        where: { id },
        relations: ['reservas', 'reservas.usuario', 'reservas.vehiculo']
      });
      
      if (!plaza) {
        this.logger.warn(`Plaza no encontrada con ID: ${id}`);
        throw new NotFoundException(`Plaza con ID ${id} no encontrada`);
      }

      this.logger.log(`Plaza encontrada: ${plaza.numero_plaza} (${plaza.estado})`);
      
      return plaza;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error al buscar plaza ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al buscar plaza');
    }
  }

  /**
   * Actualizar una plaza existente
   * Solo accesible por administradores
   * Valida unicidad del número de plaza si se cambia
   * 
   * @param id - ID de la plaza a actualizar
   * @param updatePlazaDto - Datos a actualizar
   * @returns Plaza actualizada
   * @throws NotFoundException si la plaza no existe
   * @throws BadRequestException si el nuevo número ya existe
   */
  async update(id: number, updatePlazaDto: UpdatePlazaDto): Promise<Plaza> {
    this.logger.log(`Actualizando plaza ID: ${id}`);

    // Verificar que la plaza existe
    const plaza = await this.findOne(id);

    try {
      // Verificar número de plaza único si se cambia
      if (updatePlazaDto.numero_plaza && updatePlazaDto.numero_plaza !== plaza.numero_plaza) {
        const existingPlaza = await this.plazaRepository.findOne({ 
          where: { numero_plaza: updatePlazaDto.numero_plaza } 
        });
        
        if (existingPlaza) {
          this.logger.warn(`Intento de cambio a número de plaza duplicado: ${updatePlazaDto.numero_plaza}`);
          throw new BadRequestException(`La plaza ${updatePlazaDto.numero_plaza} ya existe en el sistema`);
        }
      }

      // Aplicar actualizaciones
      await this.plazaRepository.update(id, updatePlazaDto);
      const updatedPlaza = await this.findOne(id);
      
      this.logger.log(`Plaza actualizada exitosamente: ${updatedPlaza.numero_plaza}`);
      
      return updatedPlaza;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error al actualizar plaza ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al actualizar plaza');
    }
  }

  /**
   * Eliminar una plaza del sistema
   * Solo accesible por administradores
   * Verifica que no tenga reservas activas antes de eliminar
   * 
   * @param id - ID de la plaza a eliminar
   * @throws NotFoundException si la plaza no existe
   * @throws BadRequestException si tiene reservas activas
   */
  async remove(id: number): Promise<void> {
    this.logger.log(`Eliminando plaza ID: ${id}`);

    const plaza = await this.findOne(id);

    try {
      // Verificar si tiene reservas activas
      const hasActiveReservations = plaza.reservas?.some(
        reserva => reserva.estado === 'activa'
      );

      if (hasActiveReservations) {
        this.logger.warn(`Intento de eliminar plaza ${plaza.numero_plaza} con reservas activas`);
        throw new BadRequestException('No se puede eliminar una plaza con reservas activas');
      }

      await this.plazaRepository.remove(plaza);
      
      this.logger.log(`Plaza eliminada exitosamente: ${plaza.numero_plaza} (ID: ${id})`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error al eliminar plaza ${id}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al eliminar plaza');
    }
  }

  /**
   * Obtener plazas filtradas por estado
   * Útil para consultas operacionales específicas
   * 
   * @param estado - Estado por el cual filtrar
   * @returns Lista de plazas con el estado especificado
   */
  async findByEstado(estado: EstadoPlaza): Promise<Plaza[]> {
    this.logger.log(`Obteniendo plazas con estado: ${estado}`);

    try {
      const plazas = await this.plazaRepository.find({ 
        where: { estado },
        order: { numero_plaza: 'ASC' }
      });
      
      this.logger.log(`Se encontraron ${plazas.length} plazas con estado ${estado}`);
      
      return plazas;
    } catch (error) {
      this.logger.error(`Error al obtener plazas por estado ${estado}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al filtrar plazas por estado');
    }
  }

  /**
   * Obtener plazas filtradas por tipo
   * Útil para búsquedas de plazas especializadas
   * 
   * @param tipo - Tipo por el cual filtrar
   * @returns Lista de plazas con el tipo especificado
   */
  async findByTipo(tipo: TipoPlaza): Promise<Plaza[]> {
    this.logger.log(`Obteniendo plazas con tipo: ${tipo}`);

    try {
      const plazas = await this.plazaRepository.find({ 
        where: { tipo },
        order: { numero_plaza: 'ASC' }
      });
      
      this.logger.log(`Se encontraron ${plazas.length} plazas con tipo ${tipo}`);
      
      return plazas;
    } catch (error) {
      this.logger.error(`Error al obtener plazas por tipo ${tipo}: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al filtrar plazas por tipo');
    }
  }

  /**
   * Obtener estadísticas de ocupación del parking
   * Caso de uso principal: consulta de ocupación por empleados
   * Proporciona vista general del estado operativo
   * 
   * @returns Estadísticas detalladas de ocupación
   */
  async getOcupacion(): Promise<{
    total: number;
    ocupadas: number;
    libres: number;
    mantenimiento: number;
    porcentajeOcupacion: number;
    disponibles: number;
  }> {
    this.logger.log('Calculando estadísticas de ocupación del parking');

    try {
      const total = await this.plazaRepository.count();
      const ocupadas = await this.plazaRepository.count({ where: { estado: EstadoPlaza.OCUPADA } });
      const libres = await this.plazaRepository.count({ where: { estado: EstadoPlaza.LIBRE } });
      const mantenimiento = await this.plazaRepository.count({ where: { estado: EstadoPlaza.MANTENIMIENTO } });
      
      // Plazas disponibles para reserva (libres)
      const disponibles = libres;
      
      // Porcentaje de ocupación sobre plazas operativas (excluyendo mantenimiento)
      const plazasOperativas = total - mantenimiento;
      const porcentajeOcupacion = plazasOperativas > 0 
        ? Math.round((ocupadas / plazasOperativas) * 100) 
        : 0;

      const estadisticas = {
        total,
        ocupadas,
        libres,
        mantenimiento,
        porcentajeOcupacion,
        disponibles
      };

      this.logger.log(`Estadísticas de ocupación calculadas: ${JSON.stringify(estadisticas)}`);
      
      return estadisticas;
    } catch (error) {
      this.logger.error(`Error al calcular ocupación: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al calcular estadísticas de ocupación');
    }
  }

  /**
   * Obtener plazas disponibles para reserva
   * Filtra solo plazas en estado LIBRE
   * Usado en el proceso de creación de reservas
   * 
   * @param tipo - Tipo específico de plaza (opcional)
   * @returns Lista de plazas disponibles
   */
  async findAvailable(tipo?: TipoPlaza): Promise<Plaza[]> {
    this.logger.log(`Obteniendo plazas disponibles${tipo ? ` de tipo ${tipo}` : ''}`);

    try {
      const whereCondition: any = { estado: EstadoPlaza.LIBRE };
      if (tipo) {
        whereCondition.tipo = tipo;
      }

      const plazasDisponibles = await this.plazaRepository.find({
        where: whereCondition,
        order: { numero_plaza: 'ASC' }
      });

      this.logger.log(`Se encontraron ${plazasDisponibles.length} plazas disponibles`);
      
      return plazasDisponibles;
    } catch (error) {
      this.logger.error(`Error al obtener plazas disponibles: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al obtener plazas disponibles');
    }
  }
}
