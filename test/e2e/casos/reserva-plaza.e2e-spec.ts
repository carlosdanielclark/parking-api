// test/e2e/casos/reserva-plaza.e2e-spec.ts
import request, { Response } from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper, AuthenticatedUser } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { EstadoPlaza } from '../../../src/entities/plaza.entity';
import { EstadoReservaDTO } from '../../../src/entities/reserva.entity';
import { logStepV3 } from '../../helpers/log-util';
import { UserRole } from '../../../src/entities/user.entity';

jest.setTimeout(240000); // Aumentar timeout global
/**
 * Tests E2E para Caso de Uso 1: Reservar Plaza de Aparcamiento
 * 
 * Cubre el flujo completo donde un cliente desea reservar una plaza de aparcamiento
 * para un vehículo en particular, verificando disponibilidad y creando la reserva.
 */
describe('Caso de Uso 1: Reservar Plaza de Aparcamiento (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let usuarios: {
    admin: AuthenticatedUser;
    empleado: AuthenticatedUser;
    cliente: AuthenticatedUser;
  };
  let plazas: any[];
  let vehiculo: any;
  let reservas: any[] = []; // Array para trackear reservas creadas

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();

    authHelper = new AuthHelper(app);
    dataFixtures = new DataFixtures(app);
  });

  beforeEach(async () => {
    // Resetear array de reservas
    reservas = [];
    
    // Crear usuarios de prueba
    usuarios = await authHelper.createMultipleUsers();
    
    // Crear plazas disponibles
    plazas = await dataFixtures.createPlazas(usuarios.admin.token, {
      count: 5,
      estado: EstadoPlaza.LIBRE
    });
    
    // Crear vehículo para el cliente
    vehiculo = await dataFixtures.createVehiculo(
      usuarios.cliente.user.id, 
      usuarios.cliente.token,
      {
        placa: `P${Date.now().toString().substring(7)}`, // Placa única
        marca: 'Toyota',
        modelo: 'Corolla',
        color: 'Blanco'
      }
    );

    console.log(`🎯 Setup completado: ${plazas.length} plazas, vehículo ${vehiculo.placa}`);
  });

  // Agregar afterEach para limpieza
  afterEach(async () => {
    try {
      const adminToken = await authHelper.getAdminToken();

      // Usar el nuevo método de limpieza completa
      await dataFixtures.cleanupCompleto(
        adminToken,
        reservas,        // Array de reservas creadas
        [vehiculo],      // Array de vehículos creados
        plazas          // Array de plazas creadas
      );

    } catch (error) {
      logStepV3(`Error en cleanup afterEach: ${error.message}`, { 
        tipo: "warning", 
        etiqueta: 'AFTEREACH'
      });
      
      // Limpieza de emergencia - intentar cancelar reservas al menos
      try {
        const emergencyToken = await authHelper.getAdminToken();
        for (const reserva of reservas) {
          try {
            await request(app.getHttpServer())
              .post(`/reservas/${reserva.id}/cancelar`)
              .set(authHelper.getAuthHeader(emergencyToken))
              .timeout(5000);
          } catch (innerError) {
            // Capturar error específico de cada reserva
            logStepV3(`Error cancelando reserva ${reserva.id}: ${innerError.message}`, { 
              tipo: "warning", 
              etiqueta: 'AFTEREACH_EMERGENCY' 
            });
          }
        }
      } catch (emergencyError) {
        // Capturar error del proceso de emergencia
        logStepV3(`Error en cleanup de emergencia: ${emergencyError.message}`, { 
          tipo: "error", 
          etiqueta: 'AFTEREACH_EMERGENCY_FAIL' 
        });
      }
    } finally {
      // Limpiar arrays para el próximo test (siempre se ejecuta)
      reservas = [];
    }
  });


  describe('Flujo exitoso de reserva', () => {
    it('debe permitir a un cliente reservar una plaza disponible', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      logStepV3(`Creando reserva: Plaza ${plazas[0].numero_plaza} para ${vehiculo.placa}`, { etiqueta: 'RESERVA' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      // Guardar reserva para limpieza
      reservas.push(response.body.data);

      // Verificar estructura de respuesta
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        estado: EstadoReservaDTO.ACTIVA,
        fecha_inicio: expect.any(String),
        fecha_fin: expect.any(String),
      });

      // Verificar que incluye relaciones
      expect(response.body.data.usuario).toMatchObject({
        id: usuarios.cliente.user.id,
        nombre: usuarios.cliente.user.nombre,
        email: usuarios.cliente.user.email,
      });

      expect(response.body.data.plaza).toMatchObject({
        id: plazas[0].id,
        numero_plaza: plazas[0].numero_plaza,
        estado: EstadoPlaza.OCUPADA, // Plaza debe cambiar a ocupada
      });

      expect(response.body.data.vehiculo).toMatchObject({
        id: vehiculo.id,
        placa: vehiculo.placa,
        marca: vehiculo.marca,
      });

      logStepV3(`Reserva creada exitosamente:`, { etiqueta: 'RESERVA' }, response.body.data.id);
    });

    it('debe actualizar el estado de la plaza a OCUPADA tras crear reserva', async () => {
      // Verificar que la plaza está libre inicialmente
      logStepV3(`Verificando estado inicial de la plaza...`, { etiqueta: 'PLAZA' });
      let plazaResponse = await request(app.getHttpServer())
        .get(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .timeout(10000) // Timeout aumentado
        .expect(200);

      logStepV3(`Estado inicial plaza: ${plazaResponse.body.data.estado}`, { etiqueta: 'PLAZA' });
      expect(plazaResponse.body.data.estado).toBe(EstadoPlaza.LIBRE);

      // Crear reserva
      logStepV3(`Creando reserva...`, { etiqueta: 'RESERVA' });
      const reservaDto = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const reservaResp = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaDto)
        .timeout(15000) // Timeout aumentado
        .expect(201);

      logStepV3(`Reserva creada con ID: ${reservaResp.body.data.id}`, { etiqueta: 'RESERVA' });
      
      // Guardar reserva para limpieza
      reservas.push(reservaResp.body.data);

      // Polling mejorado para verificar cambio de estado
      let intentos = 0;
      let estadoActual = EstadoPlaza.LIBRE;
      const MAX_INTENTOS = 30; // Aumentado
      const DELAY_MS = 500;
      let plazaStatusResp: Response;

      logStepV3(`Iniciando polling para verificar cambio de estado...`, { etiqueta: 'POLLING' });

      while (intentos < MAX_INTENTOS) {
        try {
          logStepV3(`Intento ${intentos + 1} de ${MAX_INTENTOS}`, { etiqueta: 'POLLING' });
          
          plazaStatusResp = await request(app.getHttpServer())
            .get(`/plazas/${reservaDto.plaza_id}`)
            .set(authHelper.getAuthHeader(usuarios.empleado.token))
            .timeout(10000)
            .expect(200);

          estadoActual = plazaStatusResp.body.data.estado;
          logStepV3(`Estado actual de la plaza: ${estadoActual}`, { etiqueta: 'PLAZA' });

          if (estadoActual === EstadoPlaza.OCUPADA) {
            logStepV3(`¡Estado OCUPADA detectado en intento ${intentos + 1}!`, { etiqueta: 'PLAZA' });
            break;
          }

          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
          intentos++;
          
        } catch (error) {
          logStepV3(`Error en polling intento ${intentos + 1}: ${error.message}`, { etiqueta: 'POLLING', tipo: 'error' });
          
          // Si es error de conexión, esperar más tiempo
          if (error.message.includes('ECONNRESET') || error.message.includes('timeout')) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          intentos++;
        }
      }

      // Verificar el resultado final
      logStepV3(`Estado final después de polling: ${estadoActual}`, { etiqueta: 'PLAZA' });
      logStepV3(`Intentos realizados: ${intentos}/${MAX_INTENTOS}`, { etiqueta: 'TIME' });
      
      if (estadoActual !== EstadoPlaza.OCUPADA) {
        logStepV3(`⚠️ Polling no detectó el cambio a OCUPADA`, { etiqueta: 'PLAZA', tipo: 'error' });
        
        // Hacer una última verificación con más detalles
        try {
          const finalCheck = await request(app.getHttpServer())
            .get(`/plazas/${reservaDto.plaza_id}`)
            .set(authHelper.getAuthHeader(usuarios.empleado.token))
            .timeout(10000);
            
          logStepV3(`Verificación final - Estado: ${finalCheck.body.data.estado}`, { etiqueta: 'PLAZA' });
          logStepV3(`Respuesta completa:`, { etiqueta: 'PLAZA', tipo: 'warning' }, JSON.stringify(finalCheck.body, null, 2));
          
          estadoActual = finalCheck.body.data.estado;
        } catch (checkError) {
          logStepV3(`Error en verificación final: ${checkError.message}`, { etiqueta: 'PLAZA', tipo: 'error' });
        }
      }
      
      expect(estadoActual).toBe(EstadoPlaza.OCUPADA);
    });

    it('debe rechazar reservas con fecha fin anterior a fecha inicio', async () => {
      logStepV3(`Preparando reserva con fecha fin anterior a fecha inicio...`, { etiqueta: 'RESERVA' , tipo: 'info'});
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(5), // 5 horas en el futuro
        fecha_fin: dataFixtures.generateFutureDate(2),    // 2 horas en el futuro (ANTERIOR)
      };

      logStepV3(`Fecha inicio:`, { etiqueta: 'DATE' , tipo: 'info'}, reservaData.fecha_inicio);
      logStepV3(`Fecha fin:`, { etiqueta: 'DATE' , tipo: 'info'}, reservaData.fecha_fin);
      logStepV3(`Verificando que fecha fin es anterior:`, { etiqueta: 'DATE' , tipo: 'info'});
      new Date(reservaData.fecha_fin) < new Date(reservaData.fecha_inicio);

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400); // Esperamos código 400 Bad Request

      logStepV3(`Respuesta de error recibida:`, { etiqueta: 'RESERVA' , tipo: 'error'}, JSON.stringify(response.body, null, 2));
      // Verificar que el mensaje de error contenga la validación esperada
      expect(response.body.message).toContain('fecha de fin debe ser posterior');
      
      console.log('✅ Test de validación de fechas pasado correctamente');
      logStepV3(`Test de validación de fechas pasado correctamente`, { etiqueta: 'RESERVA' , tipo: 'info'});
    });
  });
 
  describe('Validaciones de negocio', () => {
    it('debe rechazar reserva de plaza ya ocupada', async () => {
      // Ocupar la plaza con una reserva
      await dataFixtures.createReserva(
        usuarios.cliente.user.id,
        plazas[0].id,
        vehiculo.id,
        usuarios.cliente.token
      );

      // Intentar reservar la misma plaza
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(2),
        fecha_fin: dataFixtures.generateFutureDate(5),
      };

      // Esperar a que la plaza esté realmente ocupada
      await dataFixtures.waitForPlazaState(app, plazas[0].id, EstadoPlaza.OCUPADA, authHelper, usuarios);

      logStepV3(`Intento de ocupar plaza reservada: User(${usuarios.cliente.user.id}; Plaza(${plazas[0].id}:${EstadoPlaza.OCUPADA}))`, { tipo: 'info', etiqueta: 'NEGOCIO' });
      // Nuevo intento de reserva sobre plaza ocupada
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      logStepV3('Respuesta error esperada', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('La plaza no está disponible para reservar en el rango de fechas indicado');
      
    });

    it('debe rechazar fechas de inicio en el pasado', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generatePastDate(1),
        fecha_fin: dataFixtures.generateFutureDate(3),
      };
      logStepV3(`Intentando reservar con fecha pasada: Inicio(${reservaData.fecha_inicio}) || Fin(${reservaData.fecha_fin})`, { etiqueta: 'NEGOCIO' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      logStepV3('Respuesta error esperada', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('fecha de inicio debe ser futura');
    });

    it('debe rechazar reservas con fecha fin anterior a fecha inicio', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(5),
        fecha_fin: dataFixtures.generateFutureDate(2),
      };
      logStepV3(`Intentando reserva con fecha fin(${reservaData.fecha_fin}) anterior a inicio(${reservaData.fecha_inicio})`, { etiqueta: 'NEGOCIO' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      logStepV3('Respuesta error esperada', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('fecha de fin debe ser posterior');
    });

    it('debe rechazar reservas que excedan 24 horas', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(26),
      };
      logStepV3(`Intentando reserva mayor a 24h: inicio(${reservaData.fecha_inicio} || fin(${reservaData.fecha_fin})`, { etiqueta: 'NEGOCIO' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      logStepV3('Respuesta error esperada', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('no puede exceder 24 horas');
    });

    it('debe rechazar reserva con vehículo que no pertenece al usuario', async () => {
      logStepV3('Creando otro cliente y vehículo', { etiqueta: 'NEGOCIO' });
      
      // Crear otro cliente
      const otroCliente = await authHelper.createAndLoginUser(UserRole.CLIENTE);
      
      // Validar que el cliente fue creado correctamente
      expect(otroCliente.user.id).toBeDefined();
      expect(otroCliente.token).toBeDefined();
      
      // Crear vehículo para el otro cliente con datos válidos
      const placaUnica = dataFixtures.generateUniquePlaca();
      const vehiculoData = {
        placa: placaUnica,
        marca: 'Mazda',
        modelo: '3',
        color: 'Negro',
        usuario_id: otroCliente.user.id,
      };
      
      logStepV3('Creando vehículo para otro cliente...', { etiqueta: 'NEGOCIO' });
      
      const otroVehiculoResp = await request(app.getHttpServer())
        .post('/vehiculos')
        .set(authHelper.getAuthHeader(otroCliente.token))
        .send(vehiculoData)
        .timeout(10000)
        .expect(201);
        
      logStepV3('Vehículo creado para otro usuario:', { etiqueta: 'NEGOCIO' }, otroVehiculoResp.body.data.id);

      // Intentar crear reserva usando el vehículo del otro usuario
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,  // Usuario original
        plaza_id: plazas[0].id,
        vehiculo_id: otroVehiculoResp.body.data.id,  // Vehículo de otro usuario
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      
      logStepV3('Intentando reservar con vehículo ajeno...', { etiqueta: 'NEGOCIO' });
      logStepV3(`Cliente original: ${reservaData.usuario_id}, Vehículo ajeno: ${reservaData.vehiculo_id}`, { etiqueta: 'NEGOCIO' });

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .timeout(10000)
        .expect(400); // Debe fallar con BadRequest

      logStepV3('Respuesta error esperada:', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      
      // Verificar que el mensaje de error es el esperado
      expect(response.body.message).toMatch(/vehículo.*no.*pertenece.*usuario|no.*permitido.*vehículo.*otro.*usuario/i);

      // Cleanup del vehículo creado para evitar interferencias
      try {
        await request(app.getHttpServer())
          .delete(`/vehiculos/${otroVehiculoResp.body.data.id}`)
          .set(authHelper.getAuthHeader(otroCliente.token))
          .timeout(5000);
      } catch (cleanupError) {
        logStepV3('Error limpiando vehículo del otro usuario:', { tipo: 'warning', etiqueta: 'NEGOCIO' }, cleanupError.message);
      }
    });

  });

  describe('Validaciones de autorización', () => {

    it('debe permitir solo a clientes crear reservas para sí mismos', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      logStepV3('Cliente creando su propia reserva', { etiqueta: 'AUTH' }, reservaData.usuario_id);
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      logStepV3('Reserva creada exitosamente', { tipo: 'info', etiqueta: 'AUTH' }, response.body.message);

    });

    it('debe rechazar que un cliente cree reserva para otro usuario', async () => {
      const otroCliente = await authHelper.createAndLoginUser(UserRole.CLIENTE);
      const reservaData = {
        usuario_id: otroCliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      logStepV3('Cliente intentando reservar para otro usuario', { etiqueta: 'AUTH' }, reservaData.usuario_id);
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(403);

      logStepV3('Respuesta error esperada (forbidden)', { tipo: 'error', etiqueta: 'AUTH' }, response.body.message);
      expect(response.body.message).toContain('Solo puedes crear reservas para ti mismo');
    });

    it('debe rechazar acceso sin autenticación', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      logStepV3('Intentando crear reserva sin autenticación', { etiqueta: 'AUTH' }, reservaData.usuario_id, reservaData.vehiculo_id);
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .send(reservaData)
        .expect(401);

      logStepV3('Respuesta error esperada (unauthorized)', { tipo: 'error', etiqueta: 'AUTH' }, response.body.message);
      expect(response.body.message).toContain('No auth token');
    });

  });


  afterAll(async () => {
    await app.close();
  });
  
});
