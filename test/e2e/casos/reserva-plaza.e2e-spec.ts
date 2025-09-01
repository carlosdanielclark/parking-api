// test/e2e/casos/reserva-plaza.e2e-spec.ts
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper, TestUser } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { UserRole } from '../../../src/entities/user.entity';
import { EstadoPlaza, TipoPlaza } from '../../../src/entities/plaza.entity';
import { EstadoReservaDTO } from '../../../src/entities/reserva.entity';

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
    admin: TestUser;
    empleado: TestUser;
    cliente: TestUser;
  };
  let plazas: any[];
  let vehiculo: any;

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
        placa: 'TEST001',
        marca: 'Toyota',
        modelo: 'Corolla',
        color: 'Blanco'
      }
    );

    console.log(`🎯 Setup completado: ${plazas.length} plazas, vehículo ${vehiculo.placa}`);
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

      console.log(`📅 Creando reserva: Plaza ${plazas[0].numero_plaza} para ${vehiculo.placa}`);

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

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

      console.log('✅ Reserva creada exitosamente:', response.body.data.id);
    });

    it('debe actualizar el estado de la plaza a OCUPADA tras crear reserva', async () => {
      // Verificar que la plaza está libre inicialmente
      let plazaResponse = await request(app.getHttpServer())
        .get(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(plazaResponse.body.data.estado).toBe(EstadoPlaza.LIBRE);

      // Crear reserva
      await dataFixtures.createReserva(
        usuarios.cliente.user.id,
        plazas[0].id,
        vehiculo.id,
        usuarios.cliente.token
      );

      // Verificar que la plaza cambió a ocupada
      plazaResponse = await request(app.getHttpServer())
        .get(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(plazaResponse.body.data.estado).toBe(EstadoPlaza.OCUPADA);
    });

    it('debe registrar la reserva en los logs del sistema', async () => {
      // Crear reserva
      const reserva = await dataFixtures.createReserva(
        usuarios.cliente.user.id,
        plazas[0].id,
        vehiculo.id,
        usuarios.cliente.token
      );

      // Buscar en logs (solo admin puede acceder)
      const logsResponse = await request(app.getHttpServer())
        .get('/admin/logs?action=create_reservation')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(logsResponse.body.logs.length).toBeGreaterThan(0);
      
      // Verificar que existe log de la reserva
      const reservaLog = logsResponse.body.logs.find(log => 
        log.resourceId === reserva.id && 
        log.action === 'create_reservation'
      );
      
      expect(reservaLog).toBeDefined();
      expect(reservaLog.userId).toBe(usuarios.cliente.user.id);
      expect(reservaLog.level).toBe('info');
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

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('plaza no está disponible');
    });

    it('debe rechazar fechas de inicio en el pasado', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generatePastDate(1), // 1 hora atrás
        fecha_fin: dataFixtures.generateFutureDate(3),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('fecha de inicio debe ser futura');
    });

    it('debe rechazar reservas con fecha fin anterior a fecha inicio', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(5),
        fecha_fin: dataFixtures.generateFutureDate(2), // Fecha fin anterior
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('fecha de fin debe ser posterior');
    });

    it('debe rechazar reservas que excedan 24 horas', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(26), // 25 horas después
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('no puede exceder 24 horas');
    });

    it('debe rechazar reserva con vehículo que no pertenece al usuario', async () => {
      // Crear otro cliente con vehículo
      const otroCliente = await authHelper.createAndLoginUser(UserRole.CLIENTE);
      const otroVehiculo = await dataFixtures.createVehiculo(
        otroCliente.user.id,
        otroCliente.token,
        { placa: 'OTRO001' }
      );

      // Intentar que el primer cliente reserve con vehículo del segundo
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: otroVehiculo.id, // Vehículo de otro usuario
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('vehículo no pertenece al usuario');
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

      // Cliente puede crear su propia reserva
      await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);
    });

    it('debe rechazar que un cliente cree reserva para otro usuario', async () => {
      const otroCliente = await authHelper.createAndLoginUser(UserRole.CLIENTE);
      
      const reservaData = {
        usuario_id: otroCliente.user.id, // Otro usuario
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(403);

      expect(response.body.message).toContain('No puedes crear reservas para otro usuario');
    });

    it('debe rechazar acceso sin autenticación', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      await request(app.getHttpServer())
        .post('/reservas')
        .send(reservaData)
        .expect(401);
    });
  });

  describe('Tests de concurrencia', () => {
    it('debe manejar correctamente intentos simultáneos de reservar la misma plaza', async () => {
      // Crear segundo cliente y vehículo
      const cliente2 = await authHelper.createAndLoginUser(UserRole.CLIENTE);
      const vehiculo2 = await dataFixtures.createVehiculo(
        cliente2.user.id,
        cliente2.token,
        { placa: 'TEST002' }
      );

      const reservaData1 = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const reservaData2 = {
        usuario_id: cliente2.user.id,
        plaza_id: plazas[0].id, // Misma plaza
        vehiculo_id: vehiculo2.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      // Ejecutar ambas reservas simultáneamente
      const [response1, response2] = await Promise.allSettled([
        request(app.getHttpServer())
          .post('/reservas')
          .set(authHelper.getAuthHeader(usuarios.cliente.token))
          .send(reservaData1),
        request(app.getHttpServer())
          .post('/reservas')
          .set(authHelper.getAuthHeader(cliente2.token))
          .send(reservaData2),
      ]);

      // Una debe ser exitosa y la otra fallar
      const exitosas = [response1, response2].filter(r => 
        r.status === 'fulfilled' && r.value.status === 201
      );
      const fallidas = [response1, response2].filter(r => 
        r.status === 'fulfilled' && r.value.status === 400
      );

      expect(exitosas).toHaveLength(1);
      expect(fallidas).toHaveLength(1);

      console.log('✅ Concurrencia manejada correctamente: 1 exitosa, 1 fallida');
    });
  });

  describe('Tipos de plaza específicos', () => {
    it('debe permitir reservar plaza para discapacitados', async () => {
      // Crear plaza específica para discapacitados
      const plazaDiscapacitados = await dataFixtures.createPlazas(
        usuarios.admin.token,
        { count: 1, tipo: TipoPlaza.DISCAPACITADO }
      );

      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazaDiscapacitados[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      expect(response.body.data.plaza.tipo).toBe(TipoPlaza.DISCAPACITADO);
    });

    it('debe permitir reservar plaza eléctrica', async () => {
      // Crear plaza eléctrica
      const plazaElectrica = await dataFixtures.createPlazas(
        usuarios.admin.token,
        { count: 1, tipo: TipoPlaza.ELECTRICO }
      );

      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazaElectrica[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      expect(response.body.data.plaza.tipo).toBe(TipoPlaza.ELECTRICO);
    });
  });

  describe('Gestión posterior de reservas', () => {
    it('debe permitir cancelar una reserva activa', async () => {
      // Crear reserva
      const reserva = await dataFixtures.createReserva(
        usuarios.cliente.user.id,
        plazas[0].id,
        vehiculo.id,
        usuarios.cliente.token
      );

      // Cancelar reserva
      const response = await request(app.getHttpServer())
        .post(`/reservas/${reserva.id}/cancelar`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.data.estado).toBe(EstadoReservaDTO.CANCELADA);

      // Verificar que la plaza vuelve a estar libre
      const plazaResponse = await request(app.getHttpServer())
        .get(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(plazaResponse.body.data.estado).toBe(EstadoPlaza.LIBRE);
    });
  });

  describe('Rendimiento con múltiples reservas', () => {
    it('debe manejar múltiples reservas simultáneas en plazas diferentes', async () => {
      // Crear múltiples vehículos
      const vehiculos = await dataFixtures.createMultipleVehiculos(
        usuarios.cliente.user.id,
        usuarios.cliente.token,
        3
      );

      // Crear reservas para diferentes plazas simultáneamente
      const reservasPromises = vehiculos.map((veh, index) => 
        dataFixtures.createReserva(
          usuarios.cliente.user.id,
          plazas[index].id,
          veh.id,
          usuarios.cliente.token,
          { horasEnElFuturo: index + 1 }
        )
      );

      const startTime = Date.now();
      const reservas = await Promise.all(reservasPromises);
      const duration = Date.now() - startTime;

      expect(reservas).toHaveLength(3);
      expect(duration).toBeLessThan(5000); // Menos de 5 segundos
      
      reservas.forEach(reserva => {
        expect(reserva.estado).toBe(EstadoReservaDTO.ACTIVA);
      });

      console.log(`⚡ ${reservas.length} reservas creadas en ${duration}ms`);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
