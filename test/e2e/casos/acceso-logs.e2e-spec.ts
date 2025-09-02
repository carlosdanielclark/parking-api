// test/e2e/casos/acceso-logs.e2e-spec.ts
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { UserRole } from '../../../src/entities/user.entity';

/**
 * Tests E2E para Caso de Uso 4: Acceder a los Logs del Parking
 * 
 * Cubre el flujo donde un administrador desea acceder a los logs de actividad
 * del parking para conocer el historial de operaciones críticas del sistema.
 */
describe('Caso de Uso 4: Acceder a los Logs del Parking (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let usuarios: {
    admin: { user: any, token: string },
    empleado: { user: any, token: string },
    cliente: { user: any, token: string }
  };

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

    // Generar actividad para crear logs
    await generarActividadDePrueba();
  });

  async function generarActividadDePrueba(): Promise<void> {
    // Crear plazas
    const plazas = await dataFixtures.createPlazas(usuarios.admin.token, { count: 3 });

    // Crear vehículo para cliente
    const vehiculo = await dataFixtures.createVehiculo(
      usuarios.cliente.user.id,
      usuarios.cliente.token,
      { placa: 'LOG001' }
    );

    // Crear reserva (genera log de create_reservation)
    const reserva = await dataFixtures.createReserva(
      usuarios.cliente.user.id,
      plazas[0].id,
      vehiculo.id,
      usuarios.cliente.token
    );

    // Cancelar reserva (genera log de cancel_reservation)
    await request(app.getHttpServer())
      .post(`/reservas/${reserva.id}/cancelar`)
      .set(authHelper.getAuthHeader(usuarios.cliente.token))
      .expect(200);

    // Actualizar usuario (genera log de update_user)
    await request(app.getHttpServer())
      .patch(`/users/${usuarios.cliente.user.id}`)
      .set(authHelper.getAuthHeader(usuarios.admin.token))
      .send({ telefono: '999888777' })
      .expect(200);

    // Login adicional para generar más logs
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: usuarios.empleado.user.email,
        password: 'empleado123456',
      })
      .expect(200);

    // Pequeña pausa para asegurar que los logs se escriban
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  describe('Acceso a logs por administrador', () => {
    it('debe permitir al administrador acceder a todos los logs del sistema', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body).toHaveProperty('summary');

      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(response.body.logs.length).toBeGreaterThan(0);

      // Verificar estructura de paginación
      expect(response.body.pagination).toMatchObject({
        total: expect.any(Number),
        page: expect.any(Number),
        limit: expect.any(Number),
        totalPages: expect.any(Number),
        hasNext: expect.any(Boolean),
        hasPrevious: expect.any(Boolean),
      });

      console.log(`📋 Logs encontrados: ${response.body.logs.length} de ${response.body.pagination.total} total`);
    });

    it('debe registrar el acceso a logs para auditoría', async () => {
      // Acceder a logs
      await request(app.getHttpServer())
        .get('/admin/logs')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      // Buscar el log de acceso a logs
      const response = await request(app.getHttpServer())
        .get('/admin/logs?action=access_logs')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.logs.length).toBeGreaterThan(0);
      
      const accessLog = response.body.logs.find(log => 
        log.userId === usuarios.admin.user.id && 
        log.action === 'access_logs'
      );

      expect(accessLog).toBeDefined();
      expect(accessLog.message).toContain('accedió a logs del sistema');
    });

    it('debe mostrar estructura completa de logs con metadatos', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      const log = response.body.logs[0];
      
      // Verificar estructura básica
      expect(log).toHaveProperty('_id');
      expect(log).toHaveProperty('level');
      expect(log).toHaveProperty('action');
      expect(log).toHaveProperty('message');
      expect(log).toHaveProperty('createdAt');

      // Campos opcionales
      if (log.userId) {
        expect(typeof log.userId).toBe('string');
      }
      if (log.resource) {
        expect(typeof log.resource).toBe('string');
      }
      if (log.details) {
        expect(typeof log.details).toBe('object');
      }
    });
  });

  describe('Filtrado de logs', () => {
    it('debe permitir filtrar logs por nivel de severidad', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?level=info')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.logs.length).toBeGreaterThan(0);
      expect(response.body.logs.every(log => log.level === 'info')).toBe(true);
    });

    it('debe permitir filtrar logs por acción específica', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?action=create_reservation')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      if (response.body.logs.length > 0) {
        expect(response.body.logs.every(log => log.action === 'create_reservation')).toBe(true);
        
        const reservationLog = response.body.logs[0];
        expect(reservationLog.message).toContain('Reserva creada');
        expect(reservationLog.resource).toBe('reserva');
      }
    });

    it('debe permitir filtrar logs por usuario específico', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin/logs?userId=${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      if (response.body.logs.length > 0) {
        expect(response.body.logs.every(log => 
          log.userId === usuarios.cliente.user.id
        )).toBe(true);
      }
    });

    it('debe permitir filtrar logs por rango de fechas', async () => {
      const hoy = new Date();
      const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
      
      const response = await request(app.getHttpServer())
        .get(`/admin/logs?startDate=${ayer.toISOString()}&endDate=${hoy.toISOString()}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      // Verificar que las fechas están en el rango
      response.body.logs.forEach(log => {
        const logDate = new Date(log.createdAt);
        expect(logDate >= ayer && logDate <= hoy).toBe(true);
      });
    });

    it('debe permitir búsqueda de texto libre en mensajes', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?search=reserva')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      if (response.body.logs.length > 0) {
        expect(response.body.logs.some(log => 
          log.message.toLowerCase().includes('reserva')
        )).toBe(true);
      }
    });

    it('debe permitir combinación de múltiples filtros', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?level=info&action=create_reservation&limit=5')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.logs.length).toBeLessThanOrEqual(5);
      
      if (response.body.logs.length > 0) {
        expect(response.body.logs.every(log => 
          log.level === 'info' && log.action === 'create_reservation'
        )).toBe(true);
      }
    });
  });

  describe('Paginación de logs', () => {
    it('debe implementar paginación correctamente', async () => {
      // Primera página
      const page1 = await request(app.getHttpServer())
        .get('/admin/logs?page=1&limit=5')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(page1.body.logs.length).toBeLessThanOrEqual(5);
      expect(page1.body.pagination.page).toBe(1);
      expect(page1.body.pagination.limit).toBe(5);

      // Segunda página si existe
      if (page1.body.pagination.hasNext) {
        const page2 = await request(app.getHttpServer())
          .get('/admin/logs?page=2&limit=5')
          .set(authHelper.getAuthHeader(usuarios.admin.token))
          .expect(200);

        expect(page2.body.pagination.page).toBe(2);
        expect(page2.body.pagination.hasPrevious).toBe(true);

        // Los IDs deben ser diferentes entre páginas
        const ids1 = page1.body.logs.map(log => log._id);
        const ids2 = page2.body.logs.map(log => log._id);
        expect(ids1.some(id => ids2.includes(id))).toBe(false);
      }
    });

    it('debe manejar páginas fuera de rango', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?page=999&limit=10')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.logs).toHaveLength(0);
      expect(response.body.pagination.page).toBe(999);
      expect(response.body.pagination.hasNext).toBe(false);
      expect(response.body.pagination.hasPrevious).toBe(true);
    });
  });

  describe('Estadísticas y resúmenes de logs', () => {
    it('debe proporcionar estadísticas generales de logs', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs/stats')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('byLevel');
      expect(response.body.data).toHaveProperty('byAction');

      // Verificar estructura de estadísticas por nivel
      const byLevel = response.body.data.byLevel;
      expect(byLevel).toHaveProperty('error');
      expect(byLevel).toHaveProperty('warn');
      expect(byLevel).toHaveProperty('info');
      expect(byLevel).toHaveProperty('debug');

      console.log('📊 Estadísticas de logs:', response.body.data);
    });

    it('debe mostrar errores recientes del sistema', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs/errors/recent?limit=5')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(5);

      // Si hay errores, verificar que todos sean nivel error
      if (response.body.data.length > 0) {
        expect(response.body.data.every(log => log.level === 'error')).toBe(true);
      }
    });

    it('debe generar resumen de actividad del parking', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs/activity-summary')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.data).toHaveProperty('totalReservations');
      expect(response.body.data).toHaveProperty('totalLogins');
      expect(response.body.data).toHaveProperty('totalErrors');
      expect(response.body.data).toHaveProperty('recentReservations');
      expect(response.body.data).toHaveProperty('recentErrors');

      const summary = response.body.data;
      expect(typeof summary.totalReservations).toBe('number');
      expect(typeof summary.totalLogins).toBe('number');
      expect(typeof summary.totalErrors).toBe('number');
      expect(Array.isArray(summary.recentReservations)).toBe(true);
      expect(Array.isArray(summary.recentErrors)).toBe(true);
    });
  });

  describe('Ordenamiento y consultas avanzadas', () => {
    it('debe permitir ordenar logs por diferentes campos', async () => {
      // Ordenar por fecha descendente (más recientes primero)
      const descResponse = await request(app.getHttpServer())
        .get('/admin/logs?sortBy=createdAt&sortOrder=desc&limit=3')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      if (descResponse.body.logs.length >= 2) {
        const firstDate = new Date(descResponse.body.logs[0].createdAt);
        const secondDate = new Date(descResponse.body.logs[1].createdAt);
        expect(firstDate >= secondDate).toBe(true);
      }

      // Ordenar por fecha ascendente (más antiguos primero)
      const ascResponse = await request(app.getHttpServer())
        .get('/admin/logs?sortBy=createdAt&sortOrder=asc&limit=3')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      if (ascResponse.body.logs.length >= 2) {
        const firstDate = new Date(ascResponse.body.logs[0].createdAt);
        const secondDate = new Date(ascResponse.body.logs[1].createdAt);
        expect(firstDate <= secondDate).toBe(true);
      }
    });

    it('debe permitir consultas complejas de logs de reservas', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?resource=reserva&level=info&sortBy=createdAt&sortOrder=desc')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      response.body.logs.forEach(log => {
        expect(log.resource).toBe('reserva');
        expect(log.level).toBe('info');
        expect(['create_reservation', 'cancel_reservation', 'finish_reservation'].includes(log.action)).toBe(true);
      });
    });
  });

  describe('Control de acceso a logs', () => {
    it('debe denegar acceso a empleados', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(403);

      expect(response.body.message).toContain('Acceso denegado');
    });

    it('debe denegar acceso a clientes', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(403);

      expect(response.body.message).toContain('Acceso denegado');
    });

    it('debe denegar acceso sin autenticación', async () => {
      await request(app.getHttpServer())
        .get('/admin/logs')
        .expect(401);
    });

    it('debe denegar acceso con token inválido', async () => {
      await request(app.getHttpServer())
        .get('/admin/logs')
        .set('Authorization', 'Bearer token_invalido')
        .expect(401);
    });
  });

  describe('Funcionalidades de mantenimiento', () => {
    it('debe permitir limpieza de logs antiguos', async () => {
      const response = await request(app.getHttpServer())
        .delete('/admin/logs/cleanup/1') // Limpiar logs de más de 1 día
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('deletedCount');
      expect(response.body.data).toHaveProperty('daysThreshold');
      expect(response.body.data.daysThreshold).toBe(1);

      console.log(`🧹 Logs eliminados: ${response.body.data.deletedCount}`);
    });

    it('debe validar parámetros de limpieza', async () => {
      // Días inválidos
      await request(app.getHttpServer())
        .delete('/admin/logs/cleanup/abc')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(400);

      // Número negativo
      await request(app.getHttpServer())
        .delete('/admin/logs/cleanup/-5')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(400);
    });
  });

  describe('Rendimiento y escalabilidad', () => {
    it('debe responder rápidamente con grandes volúmenes de logs', async () => {
      // Generar más actividad
      await generarActividadAdicional();

      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get('/admin/logs?limit=50')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(5000); // Menos de 5 segundos
      expect(response.body.logs.length).toBeLessThanOrEqual(50);

      console.log(`⚡ Consulta de ${response.body.logs.length} logs en ${responseTime}ms`);
    }, 15000);

    it('debe manejar consultas concurrentes sin degradación', async () => {
      const promesasConsulta: any[] = [];
      const numeroConsultas = 3;

      for (let i = 0; i < numeroConsultas; i++) {
        promesasConsulta.push(
          request(app.getHttpServer())
            .get(`/admin/logs?page=${i + 1}&limit=10`)
            .set(authHelper.getAuthHeader(usuarios.admin.token))
        );
      }

      const startTime = Date.now();
      const resultados = await Promise.all(promesasConsulta);
      const totalTime = Date.now() - startTime;

      // Todas las consultas deben ser exitosas
      resultados.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.pagination.page).toBe(index + 1);
      });

      expect(totalTime).toBeLessThan(10000);

      console.log(`⚡ ${numeroConsultas} consultas de logs concurrentes en ${totalTime}ms`);
    });
  });

  async function generarActividadAdicional(): Promise<void> {
    // Crear más usuarios y actividad
    const clienteExtra = await authHelper.createAndLoginUser(UserRole.CLIENTE);
    
    const plazas = await dataFixtures.createPlazas(usuarios.admin.token, { count: 2 });
    
    const vehiculo = await dataFixtures.createVehiculo(
      clienteExtra.user.id,
      clienteExtra.token,
      { placa: 'EXTRA01' }
    );

    // Crear y cancelar reservas para generar más logs
    for (let i = 0; i < 2; i++) {
      const fecha_inicio = dataFixtures.generateFutureDate(i + 2);
      const fecha_fin = dataFixtures.generateFutureDate(i + 3);

      const reserva = await dataFixtures.createReserva(
        clienteExtra.user.id,
        plazas[i].id,
        vehiculo.id,
        clienteExtra.token,
        { fecha_inicio, fecha_fin } // ahora el nombre de las propiedades es correcto
      );

      await request(app.getHttpServer())
        .post(`/reservas/${reserva.id}/cancelar`)
        .set(authHelper.getAuthHeader(clienteExtra.token))
        .expect(200);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  describe('Validación de integridad de logs', () => {
    it('debe contener todos los eventos críticos generados', async () => {
      // Verificar que se registraron logs de reservas
      const reservationLogs = await request(app.getHttpServer())
        .get('/admin/logs?action=create_reservation')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(reservationLogs.body.logs.length).toBeGreaterThan(0);

      // Verificar que se registraron logs de login
      const loginLogs = await request(app.getHttpServer())
        .get('/admin/logs?action=login')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(loginLogs.body.logs.length).toBeGreaterThan(0);

      // Verificar logs de actualización de usuarios
      const updateLogs = await request(app.getHttpServer())
        .get('/admin/logs?action=update_user')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(updateLogs.body.logs.length).toBeGreaterThan(0);
    });

    it('debe mantener consistencia temporal en los logs', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/logs?sortBy=createdAt&sortOrder=desc&limit=10')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      // Verificar que las fechas son consistentes (más recientes primero)
      for (let i = 0; i < response.body.logs.length - 1; i++) {
        const currentDate = new Date(response.body.logs[i].createdAt);
        const nextDate = new Date(response.body.logs[i + 1].createdAt);
        expect(currentDate >= nextDate).toBe(true);
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
