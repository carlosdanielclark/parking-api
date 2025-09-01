// test/helpers/data-fixtures.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { TipoPlaza, EstadoPlaza } from '../../src/entities/plaza.entity';
import { EstadoReservaDTO } from '../../src/entities/reserva.entity';

export interface PlazaOptions {
  count?: number;
  prefix?: string;
  tipo?: TipoPlaza;
  estado?: EstadoPlaza;
}

export interface VehiculoOptions {
  placa?: string;
  marca?: string;
  modelo?: string;
  color?: string;
}

export interface ReservaOptions {
  horasEnElFuturo?: number;
  duracionHoras?: number;
  estado?: EstadoReservaDTO;
}

/**
 * Helper para creación de datos de prueba en tests E2E
 * Facilita la creación de entidades con datos consistentes y realistas
 */
export class DataFixtures {
  private static plazaCounter = 0;
  private static vehiculoCounter = 0;

  constructor(private app: INestApplication) {}

  /**
   * Crea múltiples plazas de parking
   */
  async createPlazas(
    adminToken: string,
    options: PlazaOptions = {}
  ): Promise<any[]> {
    const {
      count = 5,
      prefix = 'TEST',
      tipo,
      estado = EstadoPlaza.LIBRE
    } = options;

    const plazas: any[] = [];
    
    for (let i = 1; i <= count; i++) {
      DataFixtures.plazaCounter++;
      
      // Distribuir tipos de plaza si no se especifica uno
      let tipoPlaza = tipo;
      if (!tipoPlaza) {
        if (i <= Math.ceil(count * 0.7)) {
          tipoPlaza = TipoPlaza.NORMAL;
        } else if (i <= Math.ceil(count * 0.85)) {
          tipoPlaza = TipoPlaza.DISCAPACITADO;
        } else {
          tipoPlaza = TipoPlaza.ELECTRICO;
        }
      }

      const plazaData = {
        numero_plaza: DataFixtures.plazaCounter,
        ubicacion: `${prefix} - Planta Baja - Sector ${String.fromCharCode(65 + Math.floor(i / 10))} - Plaza ${i}`,
        estado,
        tipo: tipoPlaza,
      };

      try {
        const response = await request(this.app.getHttpServer())
          .post('/plazas')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(plazaData)
          .expect(201);

        plazas.push(response.body.data);
      } catch (error) {
        console.error(`Error creando plaza ${i}:`, error);
        throw error;
      }
    }

    console.log(`🅿️ Creadas ${plazas.length} plazas de parking`);
    return plazas;
  }

  /**
   * Crea un vehículo para un usuario
   */
  async createVehiculo(
    clienteId: string,
    clienteToken: string,
    options: VehiculoOptions = {}
  ): Promise<any> {
    DataFixtures.vehiculoCounter++;
    
    const vehiculoData = {
      placa: options.placa || `TST${DataFixtures.vehiculoCounter.toString().padStart(3, '0')}`,
      marca: options.marca || this.getRandomMarca(),
      modelo: options.modelo || this.getRandomModelo(),
      color: options.color || this.getRandomColor(),
      usuario_id: clienteId,
    };

    try {
      const response = await request(this.app.getHttpServer())
        .post('/vehiculos')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send(vehiculoData)
        .expect(201);

      console.log(`🚗 Vehículo creado: ${vehiculoData.placa} (${vehiculoData.marca} ${vehiculoData.modelo})`);
      return response.body.data;
    } catch (error) {
      console.error('Error creando vehículo:', error);
      throw error;
    }
  }

  /**
   * Crea una reserva de plaza
   */
  async createReserva(
    userId: string,
    plazaId: number,
    vehiculoId: string,
    token: string,
    options: ReservaOptions = {}
  ): Promise<any> {
    const {
      horasEnElFuturo = 1,
      duracionHoras = 2,
      estado = EstadoReservaDTO.ACTIVA
    } = options;

    const ahora = new Date();
    const inicio = new Date(ahora.getTime() + (horasEnElFuturo * 60 * 60 * 1000));
    const fin = new Date(inicio.getTime() + (duracionHoras * 60 * 60 * 1000));

    const reservaData = {
      usuario_id: userId,
      plaza_id: plazaId,
      vehiculo_id: vehiculoId,
      fecha_inicio: inicio.toISOString(),
      fecha_fin: fin.toISOString(),
    };

    try {
      const response = await request(this.app.getHttpServer())
        .post('/reservas')
        .set('Authorization', `Bearer ${token}`)
        .send(reservaData)
        .expect(201);

      console.log(`📅 Reserva creada: Plaza ${plazaId} desde ${inicio.toLocaleTimeString()} hasta ${fin.toLocaleTimeString()}`);
      return response.body.data;
    } catch (error) {
      console.error('Error creando reserva:', error);
      throw error;
    }
  }

  /**
   * Crea múltiples reservas para un usuario
   */
  async createMultipleReservas(
    userId: string,
    vehiculoId: string,
    token: string,
    plazas: any[],
    count: number = 3
  ): Promise<any[]> {
    const reservas: any[] = [];
    
    for (let i = 0; i < Math.min(count, plazas.length); i++) {
      const reserva = await this.createReserva(
        userId,
        plazas[i].id,
        vehiculoId,
        token,
        {
          horasEnElFuturo: (i + 1) * 2, // Espaciar las reservas
          duracionHoras: 1 + (i % 3), // Duración variable
        }
      );
      reservas.push(reserva);
      
      // Pequeña pausa para evitar conflictos de concurrencia
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return reservas;
  }

  /**
   * Crea reservas en el pasado para testing de historial
   */
  async createPastReservas(
    userId: string,
    vehiculoId: string,
    token: string,
    plazas: any[],
    days: number = 7
  ): Promise<any[]> {
    const reservas: any[] = [];
    
    for (let i = 0; i < Math.min(days, plazas.length); i++) {
      const diasAtras = days - i;
      const ahora = new Date();
      const inicio = new Date(ahora.getTime() - (diasAtras * 24 * 60 * 60 * 1000) - (2 * 60 * 60 * 1000));
      const fin = new Date(inicio.getTime() + (60 * 60 * 1000)); // 1 hora de duración

      const reservaData = {
        usuario_id: userId,
        plaza_id: plazas[i].id,
        vehiculo_id: vehiculoId,
        fecha_inicio: inicio.toISOString(),
        fecha_fin: fin.toISOString(),
      };

      const response = await request(this.app.getHttpServer())
        .post('/reservas')
        .set('Authorization', `Bearer ${token}`)
        .send(reservaData);

      if (response.status === 201) {
        reservas.push(response.body.data);
      }
    }

    return reservas;
  }

  /**
   * Simula ocupación del parking con múltiples reservas
   */
  async simulateOccupancy(
    clientesData: Array<{ userId: string; vehiculoId: string; token: string }>,
    plazas: any[],
    occupancyPercentage: number = 0.7
  ): Promise<any[]> {
    const plazasAOcupar = Math.floor(plazas.length * occupancyPercentage);
    const reservas: any[] = [];

    for (let i = 0; i < plazasAOcupar && i < clientesData.length; i++) {
      const cliente = clientesData[i % clientesData.length];
      
      const reserva = await this.createReserva(
        cliente.userId,
        plazas[i].id,
        cliente.vehiculoId,
        cliente.token,
        {
          horasEnElFuturo: 0.1, // Empezar casi inmediatamente
          duracionHoras: 2 + Math.floor(Math.random() * 3), // 2-4 horas
        }
      );

      reservas.push(reserva);
    }

    console.log(`📊 Simulada ocupación del ${(occupancyPercentage * 100).toFixed(0)}%: ${reservas.length}/${plazas.length} plazas ocupadas`);
    return reservas;
  }

  /**
   * Crea escenario completo de testing con múltiples entidades
   */
  async createCompleteScenario(adminToken: string): Promise<{
    plazas: any[];
    clientes: Array<{ userId: string; vehiculoId: string; token: string; user: any; vehiculo: any }>;
    reservasActivas: any[];
    reservasPasadas: any[];
  }> {
    // Crear plazas
    const plazas = await this.createPlazas(adminToken, { count: 10 });

    // Crear múltiples clientes con vehículos
    const clientes: any[] = [];
    for (let i = 0; i < 5; i++) {
      const clienteResponse = await request(this.app.getHttpServer())
        .post('/auth/register')
        .send({
          nombre: `Cliente Test ${i + 1}`,
          email: `cliente.test${i + 1}@example.com`,
          password: 'cliente123456',
          telefono: `+123456789${i}`,
        })
        .expect(201);

      const loginResponse = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `cliente.test${i + 1}@example.com`,
          password: 'cliente123456',
        })
        .expect(200);

      const vehiculo = await this.createVehiculo(
        clienteResponse.body.data.user.id,
        loginResponse.body.data.access_token,
        { placa: `CLI${(i + 1).toString().padStart(3, '0')}` }
      );

      clientes.push({
        userId: clienteResponse.body.data.user.id,
        vehiculoId: vehiculo.id,
        token: loginResponse.body.data.access_token,
        user: clienteResponse.body.data.user,
        vehiculo,
      });
    }

    // Crear reservas activas
    const reservasActivas = await this.simulateOccupancy(
      clientes,
      plazas.slice(0, 6),
      0.8
    );

    // Crear reservas pasadas
    const reservasPasadas = await this.createPastReservas(
      clientes[0].userId,
      clientes[0].vehiculoId,
      clientes[0].token,
      plazas.slice(6),
      3
    );

    console.log(`🏗️ Escenario completo creado: ${plazas.length} plazas, ${clientes.length} clientes, ${reservasActivas.length} reservas activas, ${reservasPasadas.length} reservas pasadas`);

    return {
      plazas,
      clientes,
      reservasActivas,
      reservasPasadas,
    };
  }

  /**
   * Actualiza el estado de una plaza
   */
  async updatePlazaEstado(
    adminToken: string,
    plazaId: number,
    nuevoEstado: EstadoPlaza
  ): Promise<any> {
    const response = await request(this.app.getHttpServer())
      .patch(`/plazas/${plazaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ estado: nuevoEstado })
      .expect(200);

    return response.body.data;
  }

  /**
   * Cancela una reserva
   */
  async cancelReserva(
    reservaId: string,
    token: string
  ): Promise<any> {
    const response = await request(this.app.getHttpServer())
      .post(`/reservas/${reservaId}/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body.data;
  }

  /**
   * Finaliza una reserva (solo admin)
   */
  async finishReserva(
    reservaId: string,
    adminToken: string
  ): Promise<any> {
    const response = await request(this.app.getHttpServer())
      .post(`/reservas/${reservaId}/finalizar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    return response.body.data;
  }

  /**
   * Genera fechas futuras para reservas
   */
  generateFutureDate(hoursFromNow: number): string {
    const fecha = new Date();
    fecha.setHours(fecha.getHours() + hoursFromNow);
    return fecha.toISOString();
  }

  /**
   * Genera fechas pasadas para histórico
   */
  generatePastDate(hoursAgo: number): string {
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - hoursAgo);
    return fecha.toISOString();
  }

  /**
   * Crea múltiples vehículos para un usuario
   */
  async createMultipleVehiculos(
    clienteId: string,
    clienteToken: string,
    options: VehiculoOptions[] | number = 1
  ): Promise<any[]> {
    const vehiculos: any[] = [];
    let count = 1;
    let vehiculoOptions: VehiculoOptions[] = [];

    if (Array.isArray(options)) {
      count = options.length;
      vehiculoOptions = options;
    } else {
      count = options;
      vehiculoOptions = Array(count).fill({});
    }

    for (let i = 0; i < count; i++) {
      const vehiculo = await this.createVehiculo(
        clienteId,
        clienteToken,
        vehiculoOptions[i]
      );
      vehiculos.push(vehiculo);
      
      // Pequeña pausa para evitar posibles conflictos de concurrencia
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`🚗 Creados ${vehiculos.length} vehículos para el usuario ${clienteId}`);
    return vehiculos;
  }

  /**
   * Crea datos de prueba para tests de concurrencia
   */
  async createConcurrencyTestData(
    adminToken: string,
    numberOfClients: number = 5,
    numberOfPlazas: number = 3
  ): Promise<{
    plazas: any[];
    clientes: Array<{ userId: string; vehiculoId: string; token: string }>;
  }> {
    // Crear plazas limitadas para forzar concurrencia
    const plazas = await this.createPlazas(adminToken, { count: numberOfPlazas });

    // Crear múltiples clientes que competirán por las plazas
    const clientes: any[] = [];
    for (let i = 0; i < numberOfClients; i++) {
      const clienteResponse = await request(this.app.getHttpServer())
        .post('/auth/register')
        .send({
          nombre: `Cliente Concurrencia ${i + 1}`,
          email: `concurrencia${i + 1}@test.com`,
          password: 'cliente123456',
        })
        .expect(201);

      const loginResponse = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `concurrencia${i + 1}@test.com`,
          password: 'cliente123456',
        })
        .expect(200);

      const vehiculo = await this.createVehiculo(
        clienteResponse.body.data.user.id,
        loginResponse.body.data.access_token,
        { placa: `CON${(i + 1).toString().padStart(3, '0')}` }
      );

      clientes.push({
        userId: clienteResponse.body.data.user.id,
        vehiculoId: vehiculo.id,
        token: loginResponse.body.data.access_token,
      });
    }

    return { plazas, clientes };
  }

  // Métodos auxiliares para generar datos aleatorios
  private getRandomMarca(): string {
    const marcas = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Audi', 'Mercedes', 'Volkswagen', 'Hyundai'];
    return marcas[Math.floor(Math.random() * marcas.length)];
  }

  private getRandomModelo(): string {
    const modelos = ['Corolla', 'Civic', 'Focus', 'Cruze', 'Sentra', 'Serie 3', 'A4', 'Clase C', 'Jetta', 'Elantra'];
    return modelos[Math.floor(Math.random() * modelos.length)];
  }

  private getRandomColor(): string {
    const colores = ['Blanco', 'Negro', 'Gris', 'Azul', 'Rojo', 'Plata', 'Verde', 'Amarillo'];
    return colores[Math.floor(Math.random() * colores.length)];
  }

  /**
   * Limpia datos de prueba (útil para cleanup entre tests)
   */
  async cleanup(): Promise<void> {
    // Reset counters
    DataFixtures.plazaCounter = 0;
    DataFixtures.vehiculoCounter = 0;
  }

  /**
   * Obtiene estadísticas de los datos creados
   */
  static getStats(): { plazas: number; vehiculos: number } {
    return {
      plazas: DataFixtures.plazaCounter,
      vehiculos: DataFixtures.vehiculoCounter,
    };
  }
}