import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthHelper } from '../../test/helpers/auth/auth-helper';
import { DataFixtures } from '../../test/helpers/data/data-fixtures';

describe('Reservas E2E Test', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let jwtToken: string;
  let clienteToken: string;
  let usuarioId: string;
  let plazaId: number;
  let vehiculoId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    authHelper = new AuthHelper(app);
    dataFixtures = new DataFixtures(app);

    // Obtener token de admin para crear datos de prueba
    const adminToken = await authHelper.getAdminToken();
    
    // Crear usuario cliente para la reserva
    const cliente = await authHelper.createAndLoginUser();
    clienteToken = cliente.token;
    usuarioId = cliente.user.id;

    // Crear una plaza libre para reservar
    const plazas = await dataFixtures.createPlazas(adminToken, { count: 1 });
    plazaId = plazas[0].id;

    // Crear un vehículo para el usuario
    const vehiculo = await dataFixtures.createVehiculo(usuarioId, clienteToken, {});
    vehiculoId = vehiculo.id;

    // Usar el token del cliente para crear reservas (no admin)
    jwtToken = clienteToken;
  });

  it('should create a new reserva', async () => {
    const fechaInicio = new Date(Date.now() + 3600000); // 1 hora desde ahora
    const fechaFin = new Date(Date.now() + 7200000);    // 2 horas desde ahora

    const response = await request(app.getHttpServer())
      .post('/reservas')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        usuario_id: usuarioId,
        plaza_id: plazaId,
        vehiculo_id: vehiculoId,
        fecha_inicio: fechaInicio.toISOString(),
        fecha_fin: fechaFin.toISOString(),
      })
      .expect(201); // Debería ser 201 Created, no 400/403

    // Verificar la estructura de respuesta
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('creada exitosamente');
    expect(response.body.data).toBeDefined();
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.usuario_id).toBe(usuarioId);
    expect(response.body.data.plaza_id).toBe(plazaId);
    expect(response.body.data.vehiculo_id).toBe(vehiculoId);
    expect(response.body.data.estado).toBe('activa');
  });

  it('should fail to create reserva with invalid data', async () => {
    // Intentar crear reserva con datos inválidos
    await request(app.getHttpServer())
      .post('/reservas')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        usuario_id: 'invalid-id',
        plaza_id: 9999, // Plaza que no existe
        vehiculo_id: 'invalid-id',
        fecha_inicio: new Date().toISOString(),
        fecha_fin: new Date().toISOString(), // fecha_fin antes que fecha_inicio
      })
      .expect(400); // Debería fallar con 400 Bad Request
  });

  afterAll(async () => {
    // Limpiar datos de prueba
    const adminToken = await authHelper.getAdminToken();
    await dataFixtures.cleanupComplete(adminToken);
    await app.close();
  });
});