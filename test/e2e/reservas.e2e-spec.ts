import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Reservas E2E Test', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Login admin or user to get token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'password' });
    jwtToken = loginResponse.body.access_token;
  });

  it('should create a new reserva', () => {
    return request(app.getHttpServer())
      .post('/reservas')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        usuario_id: 'some-user-id',
        plaza_id: 1,
        vehiculo_id: 'some-vehiculo-id',
        fecha_inicio: new Date(Date.now() + 3600000).toISOString(),
        fecha_fin: new Date(Date.now() + 7200000).toISOString(),
      })
      .expect(201)
      .expect(res => {
        expect(res.body.id).toBeDefined();
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
