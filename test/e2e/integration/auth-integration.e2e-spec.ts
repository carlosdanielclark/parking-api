// test/e2e/auth.authz.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';

// Importar desde el barrel centralizado
import { createTestContext, TestContext, TestHelpers } from '../../helpers';
import { UserRole } from '../../../src/entities/user.entity';

describe('Autenticación y Autorización (E2E)', () => {
  let app: INestApplication;
  let ctx: TestContext;
  let adminToken: string;
  const usersToCleanup: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    ctx = createTestContext(app);
    adminToken = await ctx.authHelper.getAdminToken();
  });

  afterAll(async () => {
    try {
      if (usersToCleanup.length > 0) {
        await ctx.authHelper.cleanupUsers(adminToken, usersToCleanup);
      }
    } finally {
      await app.close();
    }
  });

  describe('Registro de usuarios', () => {
    it('debe permitir registrar un nuevo cliente', async () => {
      const uniqueEmail = `cliente-${Date.now()}@test.com`;

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          nombre: 'Nuevo Cliente',
          email: uniqueEmail,
          password: 'cliente123',
          telefono: '+123456789',
        })
        .expect('Content-Type', /json/)
        .expect(201);

      // Alinear con contrato efectivo observado: { message, data: { user, access_token } }
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('access_token');

      // Validar campos básicos del usuario creado
      expect(response.body.data.user).toMatchObject({
        email: uniqueEmail,
        nombre: 'Nuevo Cliente',
        role: 'cliente',
      });

      // Registrar para limpieza
      usersToCleanup.push(response.body.data.user.id);
    });
    
    it('debe rechazar emails duplicados', async () => {
      const duplicateEmail = `dup-${Date.now()}@test.com`;

      // Primer registro
      const first = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          nombre: 'Test User',
          email: duplicateEmail,
          password: 'cliente123',
          telefono: '+111111111',
        })
        .expect(201);

      usersToCleanup.push(first.body.data.user.id);

      // Segundo registro con mismo email
      const dupRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          nombre: 'Test User',
          email: duplicateEmail,
          password: 'cliente123',
          telefono: '+111111111',
        })
        // backend puede devolver 400/409/422 según validación
        .expect((r) => {
          if (![400, 409, 422].includes(r.status)) {
            throw new Error(`Expected 400/409/422 for duplicate, got ${r.status}`);
          }
        });

      // Validar que el mensaje indica duplicidad
      const msg = dupRes.body?.message || '';
      expect(String(msg).toLowerCase()).toMatch(/duplicad|exist|ya.*registrad/);
    });
  });

  describe('Login de usuarios', () => {
    it('debe permitir login con credenciales válidas', async () => {
      // Crear usuario cliente usando helper (garantiza password por rol)
      const { user } = await ctx.authHelper.createAndLoginUser(UserRole.CLIENTE, {
        nombre: 'Cliente Login',
      });
      usersToCleanup.push(user.id);

      // Login robusto usando helper de reintentos
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'cliente123' }) // coincide con getDefaultPassword
        .expect('Content-Type', /json/)
        .expect(200);

      expect(loginRes.body).toHaveProperty('data');
      expect(loginRes.body.data).toHaveProperty('access_token');
      expect(loginRes.body.data.user.email).toBe(user.email);

      // Verificar /auth/profile con el token
      const token = loginRes.body.data.access_token;
      const profile = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(profile.body).toHaveProperty('data');
      expect(profile.body.data).toHaveProperty('user');
      expect(profile.body.data.user.email).toBe(user.email);
    });

    it('debe rechazar credenciales inválidas', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'wrongpassword',
        })
        .expect('Content-Type', /json/)
        .expect(401);

      expect(String(response.body?.message || '')).toMatch(/credencial|inválid|invalid/i);
    });
  });

  describe('Protección y autorización de rutas', () => {
    it('bloquea /users sin token', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('bloquea /users con token inválido', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', 'Bearer token_invalido')
        .expect(401);
    });

    it('cliente no puede listar /users (403), admin sí (200)', async () => {
      // Crear cliente y obtener su token
      const { token: clienteToken, user: cliente } = await ctx.authHelper.createAndLoginUser(
        UserRole.CLIENTE,
        { nombre: 'Cliente Restricciones' }
      );
      usersToCleanup.push(cliente.id);

      // Cliente no autorizado a listar usuarios
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect((r) => {
          if (![403, 401].includes(r.status)) {
            throw new Error(`Expected 403/401 for client listing users, got ${r.status}`);
          }
        });

      // Admin puede listar
      const adminList = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(adminList.body).toHaveProperty('data');
      expect(Array.isArray(adminList.body.data)).toBe(true);
    });
  });
});
