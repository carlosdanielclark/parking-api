import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper } from '../../helpers/auth-helper';
import { UserRole } from '../../../src/entities/user.entity';

describe('Autenticación y Autorización (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authHelper = new AuthHelper(app);
  });

  describe('Registro de usuarios', () => {
    it('debe permitir registrar un nuevo cliente', async () => {
      const userData = {
        nombre: 'Nuevo Cliente',
        email: 'nuevo@test.com',
        password: 'password123',
        telefono: '+123456789',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data.user.role).toBe(UserRole.CLIENTE);
    });

    it('debe rechazar emails duplicados', async () => {
      const userData = {
        nombre: 'Test User',
        email: 'duplicate@test.com',
        password: 'password123',
      };

      // Primer registro
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      // Segundo registro con mismo email
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.message).toContain('email ya está registrado');
    });
  });

  describe('Login de usuarios', () => {
    it('debe permitir login con credenciales válidas', async () => {
      const user = await authHelper.createAndLoginUser(UserRole.CLIENTE);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: user.user.email,
          password: 'cliente123456',
        })
        .expect(200);

      expect(loginResponse.body.data).toHaveProperty('access_token');
      expect(loginResponse.body.data.user.email).toBe(user.user.email);
    });

    it('debe rechazar credenciales inválidas', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.message).toContain('Credenciales inválidas');
    });
  });

  describe('Protección de rutas', () => {
    it('debe permitir acceso a rutas públicas sin autenticación', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@test.com',
          password: 'password',
        })
        .expect(401); // Credenciales incorrectas, pero ruta accesible
    });

    it('debe bloquear rutas protegidas sin token', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });

    it('debe bloquear rutas protegidas con token inválido', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', 'Bearer token_invalido')
        .expect(401);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});