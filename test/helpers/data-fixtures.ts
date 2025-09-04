// test/helpers/data-fixtures.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { EstadoPlaza, TipoPlaza } from '../../src/entities/plaza.entity';
import { EstadoReservaDTO } from '../../src/entities/reserva.entity';
import { AuthHelper } from './auth-helper';
import { logStepV3 } from './log-util';

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
  private static vehiculoCounter = 0;
  private static testRunId: string;
  private static generatedPlazaNumbers: Set<string> = new Set();

  constructor(private app: INestApplication) {
    // Generar ID único para esta ejecución de tests
    if (!DataFixtures.testRunId) {
      DataFixtures.testRunId = Math.random().toString(36).substring(2, 6);
    }
  }

  /**
   * Generador de numero de plaza
   */
  private generarNumeroPlazaUnico(prefix: string): string {
      let numeroPlazaString: string;
      let attempts = 0;
      
      // Generar número de plaza único
      do {
        const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
        numeroPlazaString = `${prefix}${randomDigits}`;
        attempts++;
        
        if (attempts > 100) {
          throw new Error('No se pudo generar número de plaza único');
        }
      } while (DataFixtures.generatedPlazaNumbers.has(numeroPlazaString));

      DataFixtures.generatedPlazaNumbers.add(numeroPlazaString);

    return numeroPlazaString;
  }

  /**
   * Crea múltiples plazas de parking
   */
  async createPlazas(
    adminToken: string,
    options: PlazaOptions = {}
  ): Promise<any[]> {
    const {
      count = 5,
      prefix = 'A',
      tipo,
      estado = 'libre'
    } = options;

    const plazas: any[] = [];
    
    for (let i = 1; i <= count; i++) {
      // Generar numero_plaza en formato A0001, A0002, etc.
      const numeroPlazaString = this.generarNumeroPlazaUnico(prefix);

      let tipoPlaza = tipo;
      if (!tipoPlaza) {
        if (i <= Math.ceil(count * 0.7)) tipoPlaza = TipoPlaza.NORMAL;
        else if (i <= Math.ceil(count * 0.85)) tipoPlaza = TipoPlaza.DISCAPACITADO;
        else tipoPlaza = TipoPlaza.ELECTRICO;
      }

      const plazaData = {
        numero_plaza: numeroPlazaString,
        ubicacion: `Sector ${String.fromCharCode(65 + ((i - 1) % 26))} - ${DataFixtures.testRunId}`,
        estado,
        tipo: tipoPlaza,
      };

      try {
        const response = await request(this.app.getHttpServer())
          .post('/plazas')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(plazaData);

        if (response.status !== 201) {
          logStepV3(`Error creando plaza ${i}: Status ${response.status}`, {etiqueta: "HELPER",tipo: "error"});
          logStepV3('Response body:', {etiqueta: "HELPER",tipo: "error"}, JSON.stringify(response.body, null, 2));
          logStepV3('Request data:', {etiqueta: "HELPER",tipo: "error"}, JSON.stringify(plazaData, null, 2));
          throw new Error(`Expected 201, got ${response.status}`);
        }

        plazas.push(response.body.data);
      } catch (error) {
        logStepV3(`Error en la solicitud de crear plaza ${i}:`, {etiqueta: "HELPER", tipo: "error"},error);
        throw error;
      }
    }

    logStepV3(`🅿️ Creadas ${plazas.length} plazas de parking`);
    return plazas;
  }

  /**
   * Elimina todas las reservas asociadas a una plaza, independientemente de su estado.
   * Si el backend prohíbe el hard delete de reservas, intenta primero cancelar las activas
   * y luego intenta eliminar la plaza, logueando si persiste alguna relación.
   */
  private async limpiarReservasDePlaza(adminToken: string, plazaId: number): Promise<void> {
    try {
      // Obtener todas las reservas de la plaza
      const reservasResponse = await request(this.app.getHttpServer())
        .get(`/reservas?plaza_id=${plazaId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(5000);

      if (reservasResponse.status === 200 && reservasResponse.body.data.length > 0) {
        for (const reserva of reservasResponse.body.data) {
          try {
            if (reserva.estado === 'activa') {
              await request(this.app.getHttpServer())
                .post(`/reservas/${reserva.id}/cancelar`)
                .set('Authorization', `Bearer ${adminToken}`)
                .timeout(5000);
            }
          } catch (error) {
            // Ignorar errores de cancelación
            logStepV3(`Ignorar errores de cancelación:`,  {etiqueta: "HELPER", tipo:"error"}, error.message);
          }
        }
      }
    } catch (error) {
      logStepV3(`Error al limpiar reservas para plaza ${plazaId}:`,  {etiqueta: "HELPER", tipo:"warning"},error.message);
    }
  }

  /**
   * Limpieza completa y ordenada de datos de test
   * Maneja correctamente las dependencias entre entidades
   */
  async cleanupCompleto(
    adminToken: string,
    reservas: any[] = [],
    vehiculos: any[] = [],
    plazas: any[] = []
  ): Promise<void> {
    logStepV3('Iniciando limpieza completa ordenada...', {etiqueta: "HELPER"});
    
    try {
      // 1. Cancelar todas las reservas activas primero
      for (const reserva of reservas) {
        try {
          if (reserva.estado === 'activa') {
            await request(this.app.getHttpServer())
              .post(`/reservas/${reserva.id}/cancelar`)
              .set('Authorization', `Bearer ${adminToken}`)
              .timeout(5000);
            
            logStepV3(`Reserva ${reserva.id} cancelada`, {etiqueta: "HELPER", tipo:"info"});
          }
        } catch (error) {
          logStepV3(`Error cancelando reserva ${reserva.id}:`, {etiqueta: "HELPER", tipo:"error"},error.message);
        }
      }

      // Esperar un momento para que se procesen las cancelaciones
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. Eliminar vehículos (ahora sin reservas activas)
      for (const vehiculo of vehiculos) {
        try {
          await request(this.app.getHttpServer())
            .delete(`/vehiculos/${vehiculo.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .timeout(5000)
            .expect(200);
          
          logStepV3(`Vehículo ${vehiculo.id} eliminado`, {etiqueta: "HELPER", tipo:"info"});
        } catch (error) {
          logStepV3(`Error eliminando vehículo ${vehiculo.id}:`, {etiqueta: "HELPER", tipo:"warning"}, error.message);
        }
      }

      // 3. Finalmente eliminar plazas (ahora sin reservas)
      await this.cleanupPlazas(adminToken, plazas);

      logStepV3('Limpieza completa finalizada',{etiqueta: "HELPER"});
      
    } catch (error) {
      logStepV3('Error en limpieza completa:', {etiqueta: "HELPER", tipo:"error"},error.message);
      throw error;
    }
  }

  /**
   * Limpieza mejorada de plazas con mejor manejo de errores
   */
  async cleanupPlazas(adminToken: string, plazas: any[]): Promise<void> {
    if (!plazas || plazas.length === 0) {
      logStepV3('No hay plazas para limpiar', {etiqueta: "HELPER"});
      return;
    }

    let eliminadas = 0;
    
    for (const plaza of plazas) {
      try {
        // Intentar limpiar reservas de la plaza primero
        await this.limpiarReservasDePlaza(adminToken, plaza.id);
        
        const response = await request(this.app.getHttpServer())
          .delete(`/plazas/${plaza.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .timeout(5000);

        if (response.status === 200 && response.body.success) {
          eliminadas++;
          logStepV3(`Plaza ${plaza.id} eliminada`, {etiqueta: "HELPER"});
        } else {
          logStepV3(`No se pudo eliminar plaza ${plaza.id}:`, {etiqueta: "HELPER", tipo: "warning"} ,response.body.message || 'Respuesta inesperada');
        }
        
      } catch (error) {
        // Solo mostrar warning si no es un 404 (ya eliminada)
        if (!error.message.includes('404') && !error.message.includes('no encontrada')) {
          logStepV3(`Error eliminando plaza ${plaza.id}:`, {etiqueta: "HELPER", tipo: "warning"},error.message);
        }
      }
    }
    
    logStepV3(`Eliminadas ${eliminadas} de ${plazas.length} plazas de prueba`,{etiqueta: "HELPER"});
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
      placa: options.placa || `TST${Date.now()}${DataFixtures.vehiculoCounter}`,
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

      logStepV3(`Vehículo creado: ${vehiculoData.placa} (${vehiculoData.marca} ${vehiculoData.modelo})`, {etiqueta: "HELPER", tipo: "info"});
      return response.body.data;
    } catch (error) {
      logStepV3('Error creando vehículo:', {etiqueta: "HELPER", tipo: "info"},error);
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
   * Crea una reserva de plaza con validación previa
   * Mejorado para manejar errores 422 y validaciones
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
      fecha_inicio,
      fecha_fin
    } = options;

    // Determinar las fechas según lo proporcionado o calcularlas
    let inicio: Date;
    let fin: Date;

    if (fecha_inicio && fecha_fin) {
      inicio = new Date(fecha_inicio);
      fin = new Date(fecha_fin);
    } else {
      const ahora = new Date();
      inicio = new Date(ahora.getTime() + (horasEnElFuturo * 60 * 60 * 1000));
      fin = new Date(inicio.getTime() + (duracionHoras * 60 * 60 * 1000));
    }

    // Validaciones previas para evitar 422
    if (fin <= inicio) {
      throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    const diffHours = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60);
    if (diffHours > 24) {
      throw new Error('La reserva no puede exceder 24 horas');
    }

    if (inicio <= new Date()) {
      throw new Error('La fecha de inicio debe ser futura');
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
      // Validar que la plaza existe y está disponible
      const plazaCheck = await request(this.app.getHttpServer())
        .get(`/plazas/${plazaId}`)
        .set('Authorization', `Bearer ${token}`)
        .timeout(5000);

      if (plazaCheck.status !== 200) {
        throw new Error(`Plaza ${plazaId} no encontrada`);
      }

      // Validar que el vehículo existe y pertenece al usuario
      const vehiculoCheck = await request(this.app.getHttpServer())
        .get(`/vehiculos/${vehiculoId}`)
        .set('Authorization', `Bearer ${token}`)
        .timeout(5000);

      if (vehiculoCheck.status !== 200 || vehiculoCheck.body.data.usuario_id !== userId) {
        throw new Error(`Vehículo ${vehiculoId} no válido para usuario ${userId}`);
      }

      const response = await request(this.app.getHttpServer())
        .post('/reservas')
        .set('Authorization', `Bearer ${token}`)
        .send(reservaData)
        .timeout(10000)
        .expect(201);

      
      logStepV3(`Reserva creada: Plaza ${plazaId} desde ${inicio.toLocaleTimeString()} hasta ${fin.toLocaleTimeString()}`, { etiqueta: 'HELPER' });
      return response.body.data;
      
    } catch (error) {
      logStepV3(`Error creando reserva:`, { etiqueta: 'HELPER',tipo: 'error'}, error.message);
      
      // Si es un error 422, proporcionar más detalles
      if (error.response?.status === 422) {
        logStepV3(`Error creando reserva:`, { etiqueta: 'HELPER',tipo: 'error'}, JSON.stringify(error.response.body, null, 2));
        logStepV3('Datos enviados:', { etiqueta: 'HELPER',tipo: 'error'}, JSON.stringify(reservaData, null, 2));
      }
      
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

    logStepV3(`📊 Simulada ocupación del ${(occupancyPercentage * 100).toFixed(0)}%: ${reservas.length}/${plazas.length} plazas ocupadas`);
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

  /**
   * --- Helper para placas únicas ---
   */
  generateUniquePlaca() {
    return `TST${Date.now()}${Math.floor(Math.random() * 10000)}`;
  }

  async waitForPlazaState(app: INestApplication, plazaId: number, estadoEsperado: EstadoPlaza, authHelper: AuthHelper, usuarios: any, intentosMax = 10, delayMs = 100) {
    let intentos = 0;
    while (intentos < intentosMax) {
      const response = await request(app.getHttpServer())
        .get(`/plazas/${plazaId}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token));
      if (response.body.data.estado === estadoEsperado) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
      intentos++;
    }
    throw new Error(`La plaza no alcanzó el estado ${estadoEsperado} después de ${intentosMax} intentos`);
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
