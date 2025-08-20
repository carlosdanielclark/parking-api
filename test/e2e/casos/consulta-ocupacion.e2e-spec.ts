import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { UserRole } from '../../../src/entities/user.entity';
import { EstadoPlaza, TipoPlaza } from '../../../src/entities/plaza.entity';

describe('Caso de Uso 2: Consultar Ocupación del Parking (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let usuarios: any;
  let plazas: any[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authHelper = new AuthHelper(app);
    dataFixtures = new DataFixtures(app);
  });

  beforeEach(async () => {
    usuarios = await authHelper.createMultipleUsers();
    plazas = await dataFixtures.createPlazas(usuarios.admin.token, 10);
  });

  describe('Consulta de ocupación por empleado', () => {
    it('debe permitir a un empleado consultar la ocupación actual del parking', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        total: 10,
        ocupadas: 0,
        libres: 10,
        mantenimiento: 0,
        porcentajeOcupacion: 0,
        disponibles: 10,
      });
    });

    it('debe mostrar ocupación actualizada después de crear reservas', async () => {
      // Crear cliente y vehículo
      const vehiculo = await dataFixtures.createVehiculo(
        usuarios.cliente.user.id, 
        usuarios.cliente.token
      );

      // Crear 3 reservas
      await Promise.all([
        dataFixtures.createReserva(usuarios.cliente.user.id, plazas[0].id, vehiculo.id, usuarios.cliente.token),
        dataFixtures.createReserva(usuarios.cliente.user.id, plazas[1].id, vehiculo.id, usuarios.cliente.token),
        dataFixtures.createReserva(usuarios.cliente.user.id, plazas[2].id, vehiculo.id, usuarios.cliente.token),
      ]);

      // Consultar ocupación
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(response.body.data).toMatchObject({
        total: 10,
        ocupadas: 3,
        libres: 7,
        porcentajeOcupacion: 30,
      });
    });

    it('debe mostrar estadísticas por tipo de plaza correctamente', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(response.body.data).toHaveProperty('plazasPorTipo');
      
      // Verificar estructura de plazas por tipo
      const plazasPorTipo = response.body.data.plazasPorTipo;
      expect(plazasPorTipo).toHaveProperty('normal');
      expect(plazasPorTipo).toHaveProperty('discapacitado');
      expect(plazasPorTipo).toHaveProperty('electrico');
      
      // Verificar que cada tipo tiene estructura correcta
      Object.values(plazasPorTipo).forEach((tipo: any) => {
        expect(tipo).toHaveProperty('total');
        expect(tipo).toHaveProperty('libres');
        expect(tipo).toHaveProperty('ocupadas');
      });
    });
  });

  describe('Consulta de plazas disponibles', () => {
    it('debe mostrar todas las plazas libres', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/disponibles')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.data.every(plaza => plaza.estado === EstadoPlaza.LIBRE)).toBe(true);
    });

    it('debe permitir filtrar plazas disponibles por tipo', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/disponibles?tipo=electrico')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.data.every(plaza => plaza.tipo === TipoPlaza.ELECTRICO)).toBe(true);
    });

    it('debe excluir plazas ocupadas de la lista de disponibles', async () => {
      // Crear reserva
      const vehiculo = await dataFixtures.createVehiculo(
        usuarios.cliente.user.id, 
        usuarios.cliente.token
      );
      
      await dataFixtures.createReserva(
        usuarios.cliente.user.id, 
        plazas[0].id, 
        vehiculo.id, 
        usuarios.cliente.token
      );

      const response = await request(app.getHttpServer())
        .get('/plazas/disponibles')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.data).toHaveLength(9); // Una menos porque una está ocupada
      expect(response.body.data.find(plaza => plaza.id === plazas[0].id)).toBeUndefined();
    });
  });

  describe('Control de acceso', () => {
    it('debe permitir acceso a empleados y administradores', async () => {
      // Empleado
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      // Admin
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);
    });

    it('debe rechazar acceso a clientes para ocupación completa', async () => {
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(403);
    });

    it('debe permitir a clientes ver plazas disponibles', async () => {
      await request(app.getHttpServer())
        .get('/plazas/disponibles')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);
    });

    it('debe rechazar acceso sin autenticación', async () => {
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .expect(401);
    });
  });

  describe('Rendimiento con datos masivos', () => {
    it('debe responder rápidamente con muchas plazas', async () => {
      // Crear más plazas para simular un parking grande
      await dataFixtures.createPlazas(usuarios.admin.token, 50);

      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(3000); // Menos de 3 segundos
      expect(response.body.data.total).toBe(60); // 10 + 50 plazas
    }, 10000);
  });

  afterAll(async () => {
    await app.close();
  });
});