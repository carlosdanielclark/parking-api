import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthHelper } from '../../test/helpers';

describe('Ocupacion E2E Test', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const authHelper = new AuthHelper(app);
    jwtToken = await authHelper.getAdminToken();
  });

  it('should get ocupacion completa data', () => {
    return request(app.getHttpServer())
      .get('/ocupacion')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200)
      .expect(res => {
        // Verificar la estructura exacta confirmada
        expect(res.body.data.total).toBeDefined();
        expect(res.body.data.ocupadas).toBeDefined();
        expect(res.body.data.libres).toBeDefined();
        expect(res.body.data.porcentajeOcupacion).toBeDefined();
      });
  });

  afterAll(async () => {
    await app.close();
  });
});