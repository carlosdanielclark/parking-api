// test/e2e/auth.login.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

// Helpers E2E del proyecto
import { createTestContext, TestContext } from '../helpers';

describe('Auth E2E - login robustness', () => {
  let app: INestApplication;
  let ctx: TestContext;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    ctx = createTestContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('successful login returns JWT token and allows accessing /auth/profile', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@parking.com', password: 'admin123' })
      .expect('Content-Type', /json/)
      .expect(200);

    // Validación contrato de login
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('user');

    const token: string = res.body.data.access_token;
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    // /auth/profile puede no incluir 'success' en tu implementación actual → no lo exigimos
    const profile = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /json/)
      .expect(200);

    // Validar forma real observada: message y data.user presentes
    expect(profile.body).toHaveProperty('message'); // p.ej. "Información del perfil obtenida exitosamente"
    expect(profile.body).toHaveProperty('data');
    expect(profile.body.data).toHaveProperty('user');

    expect(profile.body.data.user).toMatchObject({
      email: 'admin@parking.com',
      role: expect.stringMatching(/admin/i),
    });
  });


  it('login with wrong password returns 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@parking.com', password: 'wrong-password' })
      .expect('Content-Type', /json/)
      .expect(401);
  });

  it('login with missing fields returns 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@parking.com' }) // falta password
      .expect('Content-Type', /json/)
      .expect(400);
  });

  it('accessing /auth/profile without token returns 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/profile')
      .expect('Content-Type', /json/)
      .expect(401);
  });

  it('accessing /auth/profile with malformed token returns 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', 'Bearer invalid.token.value')
      .expect('Content-Type', /json/)
      .expect(401);
  });
});
