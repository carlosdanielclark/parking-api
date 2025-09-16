// test/e2e/users.update.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

// Importar helpers centralizados del proyecto
import { createTestContext, TestContext } from '../helpers';
import { UserRole } from '../../src/entities/user.entity';

describe('User Management E2E - update as admin', () => {
  let app: INestApplication;
  let ctx: TestContext;
  let adminToken: string;
  let createdUserId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Crear contexto de test y obtener token admin de forma robusta
    ctx = createTestContext(app);
    adminToken = await ctx.authHelper.getAdminToken(); // usa admin@parking.com/admin123 con retries [helpers]
  });

  afterAll(async () => {
    try {
      if (createdUserId && adminToken) {
        await ctx.authHelper.cleanupUsers(adminToken, [createdUserId]);
      }
    } finally {
      await app.close();
    }
  });

  it('should update user details as admin', async () => {
    // 1) Crear un usuario cliente de prueba según CRUD oficial
    const { user: clienteUser } = await ctx.authHelper.createAndLoginUser(UserRole.CLIENTE, {
      nombre: 'Cliente E2E',
    });
    createdUserId = clienteUser.id;

    // 2) Ejecutar PATCH como admin al usuario creado
    const patchRes = await request(app.getHttpServer())
      .patch(`/users/${createdUserId}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ nombre: 'Cliente E2E Updated', telefono: '+34987654399' }) // campos válidos por CRUD
      .expect(200);

    // 3) Validar estructura y datos según contrato CRUD oficial
    expect(patchRes.body).toHaveProperty('success', true);
    expect(patchRes.body).toHaveProperty('message');
    expect(patchRes.body).toHaveProperty('data');
    expect(patchRes.body.data).toMatchObject({
      id: createdUserId,
      nombre: 'Cliente E2E Updated',
      telefono: '+34987654399',
      role: 'cliente',
    });

    // 4) Validación adicional: GET para asegurar persistencia
    const getRes = await request(app.getHttpServer())
      .get(`/users/${createdUserId}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);

    expect(getRes.body.data).toMatchObject({
      id: createdUserId,
      nombre: 'Cliente E2E Updated',
      telefono: '+34987654399',
      role: 'cliente',
    });
  });
});
