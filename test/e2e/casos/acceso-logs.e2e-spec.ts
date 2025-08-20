import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';

describe('Caso de Uso 4: Acceder a los Logs del Parking (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let usuarios: { admin: any; empleado: any; cliente: any; };

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
    usuarios = await authHelper.createMultipleUsers();

    // Crear algunos logs de actividad con función helper
    await generateSampleLogs();
  });

  async function generateSampleLogs(): Promise<void> {
    const plazas = await dataFixtures.createPlazas(usuarios.admin.token, 2);

    const vehiculo = await dataFixtures.createVehiculo(
      usuarios.cliente.user.id,
      usuarios.cliente.token
    );

    await dataFixtures.createReserva(
      usuarios.cliente.user.id,
      plazas[0].id,
      vehiculo.id,
      usuarios.cliente.token
    );

    await request(app.getHttpServer())
      .patch(`/users/${usuarios.cliente.user.id}`)
      .set(authHelper.getAuthHeader(usuarios.admin.token))
      .send({ telefono: '999888777' })
      .expect(200);

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  describe('Acceso a logs por administrador', () => {
    it('debe permitir al administrador acceder a todos los logs', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('summary');

      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(response.body.logs.length).toBeGreaterThan(0);

      expect(response.body.pagination).toMatchObject({
        total: expect.any(Number),
        page: expect.any(Number),
        limit: expect.any(Number),
        totalPages: expect.any(Number),
        hasNext: expect.any(Boolean),
        hasPrevious: expect.any(Boolean),
      });
    });

    it('debe permitir filtrar logs por nivel', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?level=info')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.logs.every(log => log.level === 'info')).toBe(true);
    });

    it('debe permitir filtrar logs por acción específica', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?action=create_reservation')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.logs.every(log => log.action === 'create_reservation')).toBe(true);
    });

    it('debe permitir filtrar logs por usuario específico', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin/logs?userId=${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.logs.every(log => log.userId === usuarios.cliente.user.id)).toBe(true);
    });

    it('debe permitir filtrar logs por rango de fechas', async () => {
      const ahora = new Date();
      const hace1Hora = new Date(ahora.getTime() - 60 * 60 * 1000);

      const response = await request(app.getHttpServer())
        .get(`/admin/logs?startDate=${hace1Hora.toISOString()}&endDate=${ahora.toISOString()}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(Array.isArray(response.body.logs)).toBe(true);

      response.body.logs.forEach(log => {
        const logDate = new Date(log.createdAt);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(hace1Hora.getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(ahora.getTime());
      });
    });

    it('debe soportar paginación correcta', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/admin/logs?limit=2&offset=0')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(page1.body.logs).toHaveLength(2);
      expect(page1.body.pagination.page).toBe(1);
      expect(page1.body.pagination.limit).toBe(2);

      const page2 = await request(app.getHttpServer())
        .get('/admin/logs?limit=2&offset=2')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(page2.body.pagination.page).toBe(2);

      const page1Ids = page1.body.logs.map(log => log._id);
      const page2Ids = page2.body.logs.map(log => log._id);
      expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
    });

    it('debe incluir resumen estadístico de los logs', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.summary).toMatchObject({
        errorCount: expect.any(Number),
        warnCount: expect.any(Number),
        infoCount: expect.any(Number),
        debugCount: expect.any(Number),
        uniqueUsers: expect.any(Number)
      });

      const { summary } = response.body;
      const totalFromSummary = summary.errorCount + summary.warnCount + summary.infoCount + summary.debugCount;
      expect(totalFromSummary).toBeLessThanOrEqual(response.body.pagination.total);
    });
  });

  // Más tests para estadísticas, exportación, seguridad y rendimiento...

  afterAll(async () => {
    await app.close();
  });
});
