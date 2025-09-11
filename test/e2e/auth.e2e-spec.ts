import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Auth E2E Test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('successful login returns JWT token', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@parking.com', password: 'admin123' })
      .expect(200)
      .expect(res => {
        expect(res.body.data).toBeDefined();
        expect(res.body.data.access_token).toBeDefined();
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
