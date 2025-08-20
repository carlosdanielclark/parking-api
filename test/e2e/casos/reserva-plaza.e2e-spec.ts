import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { UserRole } from '../../../src/entities/user.entity';
import { EstadoPlaza } from '../../../src/entities/plaza.entity';

describe('Caso de Uso 1: Reservar Plaza de Aparcamiento (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let usuarios: any;
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
    // Configurar usuarios de prueba
    usuarios = await authHelper.createMultipleUsers();
    
    // Crear plazas de prueba
    plazas = await dataFixtures.createPlazas(usuarios.admin.token, 3);
    
    // Crear vehículo de prueba
    vehiculo = await dataFixtures.createVehiculo(
      usuarios.cliente.user.id, 
      usuarios.cliente.token
    );
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

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        estado: 'activa',
      });

      expect(new Date(response.body.data.fecha_inicio)).toBeInstanceOf(Date);
      expect(new Date(response.body.data.fecha_fin)).toBeInstanceOf(Date);
    });

    it('debe actualizar el estado de la plaza a ocupada después de la reserva', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      // Crear reserva
      await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      // Verificar estado de la plaza
      const plazaResponse = await request(app.getHttpServer())
        .get(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(plazaResponse.body.data.estado).toBe(EstadoPlaza.OCUPADA);
    });

    it('debe registrar la actividad en los logs del sistema', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      // Verificar logs como administrador
      await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar a que se procese el log

      const logsResponse = await request(app.getHttpServer())
        .get('/logs?action=create_reservation&limit=10')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(logsResponse.body.data.logs.length).toBeGreaterThan(0);
      expect(logsResponse.body.data.logs[0]).toMatchObject({
        action: 'create_reservation',
        userId: usuarios.cliente.user.id,
        resource: 'reserva',
      });
    });
  });

  describe('Validaciones y casos de error', () => {
    it('debe rechazar reservas con fechas en el pasado', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generatePastDate(1), // Fecha pasada
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('fecha de inicio debe ser futura');
    });

    it('debe rechazar reservas donde fecha_fin <= fecha_inicio', async () => {
      const fechaBase = dataFixtures.generateFutureDate(2);
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: fechaBase,
        fecha_fin: fechaBase, // Misma fecha
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('fecha de fin debe ser posterior');
    });

    it('debe prevenir doble reserva de la misma plaza en el mismo horario', async () => {
      const reservaData1 = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      // Primera reserva (exitosa)
      await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData1)
        .expect(201);

      // Crear segundo cliente
      const cliente2 = await authHelper.createAndLoginUser(UserRole.CLIENTE, {
        email: 'cliente2@test.com'
      });

      const vehiculo2 = await dataFixtures.createVehiculo(
        cliente2.user.id, 
        cliente2.token, 
        { placa: 'DEF456' }
      );

      // Segunda reserva (debe fallar)
      const reservaData2 = {
        usuario_id: cliente2.user.id,
        plaza_id: plazas[0].id, // Misma plaza
        vehiculo_id: vehiculo2.id,
        fecha_inicio: dataFixtures.generateFutureDate(2), // Horario conflictivo
        fecha_fin: dataFixtures.generateFutureDate(5),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(cliente2.token))
        .send(reservaData2)
        .expect(400);

      expect(response.body.message).toContain('ya está reservada para ese período');
    });

    it('debe rechazar reservas de vehículos que no pertenecen al usuario', async () => {
      // Crear segundo cliente con su vehículo
      const cliente2 = await authHelper.createAndLoginUser(UserRole.CLIENTE, {
        email: 'cliente2@test.com'
      });
      const vehiculo2 = await dataFixtures.createVehiculo(
        cliente2.user.id, 
        cliente2.token, 
        { placa: 'GHI789' }
      );

      // Cliente 1 intenta reservar con vehículo de Cliente 2
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo2.id, // Vehículo que no le pertenece
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      expect(response.body.message).toContain('no pertenece al usuario');
    });

    it('debe rechazar reservas sin autenticación', async () => {
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

  describe('Control de concurrencia', () => {
    it('debe manejar múltiples intentos simultáneos de reserva correctamente', async () => {
      // Crear múltiples clientes
      const clientes = await Promise.all([
        authHelper.createAndLoginUser(UserRole.CLIENTE, { email: 'concurrente1@test.com' }),
        authHelper.createAndLoginUser(UserRole.CLIENTE, { email: 'concurrente2@test.com' }),
        authHelper.createAndLoginUser(UserRole.CLIENTE, { email: 'concurrente3@test.com' }),
      ]);

      // Crear vehículos para cada cliente
      const vehiculos = await Promise.all(
        clientes.map((cliente, index) => 
          dataFixtures.createVehiculo(
            cliente.user.id, 
            cliente.token, 
            { placa: `CON${index}23` }
          )
        )
      );

      // Intentar reservas simultáneas de la misma plaza
      const reservaPromises = clientes.map((cliente, index) => 
        request(app.getHttpServer())
          .post('/reservas')
          .set(authHelper.getAuthHeader(cliente.token))
          .send({
            usuario_id: cliente.user.id,
            plaza_id: plazas[0].id,
            vehiculo_id: vehiculos[index].id,
            fecha_inicio: dataFixtures.generateFutureDate(1),
            fecha_fin: dataFixtures.generateFutureDate(4),
          })
      );

      const results = await Promise.allSettled(reservaPromises);
      
      // Solo una reserva debe ser exitosa
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);
      const failed = results.filter(r => r.status === 'fulfilled' && r.value.status === 400);
      
      expect(successful.length).toBe(1);
      expect(failed.length).toBe(2);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});