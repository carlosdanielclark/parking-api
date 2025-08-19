import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('User Management E2E Test', () => {
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
      .send({ email: 'admin@example.com', password: 'password' });
    jwtToken = loginResponse.body.access_token;
  });

  it('should update user details as admin', () => {
    return request(app.getHttpServer())
      .patch('/users/some-user-id')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ nombre: 'Updated Name' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
