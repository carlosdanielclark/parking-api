import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Ocupacion E2E Test', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@parking.com', password: 'admin123' });
    jwtToken = loginResponse.body.access_token;
  });

  it('should get ocupacion completa data', () => {
    return request(app.getHttpServer())
      .get('/ocupacion')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200)
      .expect(res => {
        expect(res.body.total).toBeDefined();
        expect(res.body.ocupadas).toBeDefined();
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
