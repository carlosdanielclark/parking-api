import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { EstadoPlaza, TipoPlaza } from '../../src/entities/plaza.entity';
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
  fecha_inicio?: string;  // Agregar esta propiedad
  fecha_fin?: string;     // Agregar esta propiedad

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
   * Crea múltiples vehículos para un usuario
   */
  async createMultipleVehiculos(
    clienteId: string,
    clienteToken: string,
    count: number = 3
  ): Promise<any[]> {
    const vehiculos: any[] = [];
    
    for (let i = 0; i < count; i++) {
      const vehiculo = await this.createVehiculo(clienteId, clienteToken, {
        placa: `MLT${(i + 1).toString().padStart(3, '0')}`,
      });
      vehiculos.push(vehiculo);
    }

    return vehiculos;
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
      estado = EstadoReservaDTO.ACTIVA,
      fecha_inicio,  // Nueva propiedad opcional
      fecha_fin      // Nueva propiedad opcional
    } = options;

    // Determinar las fechas según lo proporcionado o calcularlas
    let inicio: Date;
    let fin: Date;

    if (fecha_inicio && fecha_fin) {
      // Usar las fechas proporcionadas
      inicio = new Date(fecha_inicio);
      fin = new Date(fecha_fin);
    } else {
      // Calcular las fechas basándose en horasEnElFuturo y duracionHoras
      const ahora = new Date();
      inicio = new Date(ahora.getTime() + (horasEnElFuturo * 60 * 60 * 1000));
      fin = new Date(inicio.getTime() + (duracionHoras * 60 * 60 * 1000));
    }

    const reservaData = {
      usuario_id: userId,
      plaza_id: plazaId,
      vehiculo_id: vehiculoId,
      fecha_inicio: inicio.toISOString(),
      fecha_fin: fin.toISOString(),
      estado: estado
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

      const cliente = clienteResponse.body.data;
      const vehiculo = await this.createVehiculo(cliente.user.id, cliente.access_token);

      clientes.push({
        userId: cliente.user.id,
        vehiculoId: vehiculo.id,
        token: cliente.access_token,
        user: cliente.user,
        vehiculo,
      });
    }

    // Crear reservas activas
    const reservasActivas: any[] = [];
    for (let i = 0; i < 3; i++) {
      const reserva = await this.createReserva(
        clientes[i].userId,
        plazas[i].id,
        clientes[i].vehiculoId,
        clientes[i].token
      );
      reservasActivas.push(reserva);
    }

    // Crear reservas pasadas
    const reservasPasadas = await this.createPastReservas(
      clientes[0].userId,
      clientes[0].vehiculoId,
      clientes[0].token,
      plazas.slice(5, 8)
    );

    return {
      plazas,
      clientes,
      reservasActivas,
      reservasPasadas,
    };
  }

  /**
   * Genera una fecha futura
   */
  generateFutureDate(hoursFromNow: number): string {
    const date = new Date();
    date.setHours(date.getHours() + hoursFromNow);
    return date.toISOString();
  }

  /**
   * Genera una fecha pasada
   */
  generatePastDate(hoursAgo: number): string {
    const date = new Date();
    date.setHours(date.getHours() - hoursAgo);
    return date.toISOString();
  }

  // Helpers para datos aleatorios
  private getRandomMarca(): string {
    const marcas = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'BMW', 'Mercedes', 'Audi'];
    return marcas[Math.floor(Math.random() * marcas.length)];
  }

  private getRandomModelo(): string {
    const modelos = ['Sedan', 'Corolla', 'Civic', 'Focus', 'Aveo', 'X3', 'C-Class', 'A4'];
    return modelos[Math.floor(Math.random() * modelos.length)];
  }

  private getRandomColor(): string {
    const colores = ['Blanco', 'Negro', 'Gris', 'Rojo', 'Azul', 'Plata', 'Verde'];
    return colores[Math.floor(Math.random() * colores.length)];
  }
}
