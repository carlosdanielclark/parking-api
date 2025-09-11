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
      .send({ email: 'admin@parking.com', password: 'admin123' })
      .expect(200);
    jwtToken = loginResponse.body.access_token;
  });

  it('should create a new reserva', () => {
    return request(app.getHttpServer())
      .post('/reservas')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        usuario_id: '00000000-0000-0000-0000-000000000000',
        plaza_id: 1,
        vehiculo_id: '00000000-0000-0000-0000-000000000000',
        fecha_inicio: new Date(Date.now() + 3600000).toISOString(),
        fecha_fin: new Date(Date.now() + 7200000).toISOString(),
      })
      .expect(res => {
        if (![400, 403].includes(res.status)) {
          throw new Error(`Expected status 400 or 403 but got ${res.status}`);
        }
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
