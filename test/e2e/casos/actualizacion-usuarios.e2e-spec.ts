// test/e2e/casos/actualizacion-usuarios.e2e-spec.ts
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper, AuthenticatedUser } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { UserRole } from '../../../src/entities/user.entity';
import { logStepV3 } from '../../helpers/log-util';

/**
 * Tests E2E para Caso de Uso 3: Actualizar los Detalles de un Usuario
 * 
 * Cubre el flujo donde un administrador desea actualizar los detalles de un usuario,
 * como nombre, email, teléfono y rol, con las correspondientes validaciones y logging.
 */
describe('Caso de Uso 3: Actualizar los Detalles de un Usuario (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let server: any; // referencia explícita al servidor HTTP
  let adminToken: string;
  let usuarios: {
    admin: AuthenticatedUser;
    empleado: AuthenticatedUser;
    cliente: AuthenticatedUser;
  };
  let usuarioParaActualizar: AuthenticatedUser;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    server = app.getHttpServer(); // capturar instancia

    authHelper = new AuthHelper(app);
    // Obtener token admin una sola vez para toda la suite (evita reintentos con timers)
    adminToken = await authHelper.getAdminToken();
  });

  // Limpieza entre casos para aislar datos y evitar colisiones
  afterEach(async () => {
    try {
      const adminToken = await authHelper.getAdminToken();
      // Opcional: eliminar usuarioParaActualizar si existe
      if (usuarioParaActualizar?.user?.id) {
        await request(app.getHttpServer())
          .delete(`/users/${usuarioParaActualizar.user.id}`)
          .set(authHelper.getAuthHeader(adminToken))
          .catch(() => undefined);
      }
    } catch (error: any) {
        logStepV3(`Intento fallido haciendo limpieza`, {
          etiqueta: "afterEach",
          tipo: "warning"
        }, error.message);
    } finally {
      DataFixtures.clearGeneratedPlacas();
    }
  });

  beforeEach(async () => {
    usuarios = await authHelper.createMultipleUsers();

    // Crear usuario adicional para ser actualizado con email único/no colisionante
    const uniqueSuffix = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    usuarioParaActualizar = await authHelper.createAndLoginUser(UserRole.CLIENTE, {
      nombre: 'Usuario Para Actualizar',
      email: `actualizar+${uniqueSuffix}@test.com`,
      telefono: '+1234567890',
    });

    logStepV3(`👥 Setup completado: ${Object.keys(usuarios).length + 1} usuarios creados`, {
      etiqueta: 'beforeEach',
    });
  });


  describe('Actualización de usuarios por administrador', () => {
    it('debe permitir a un administrador actualizar cualquier campo de un usuario', async () => {
      const datosActualizados = {
        nombre: 'Nombre Actualizado',
        telefono: '+9876543210',
      };

      logStepV3(`📝 Actualizando usuario ${usuarioParaActualizar.user.id}`,{
        etiqueta: "update user - admin"
      });

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(datosActualizados)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: usuarioParaActualizar.user.id,
        nombre: datosActualizados.nombre,
        telefono: datosActualizados.telefono,
        email: usuarioParaActualizar.user.email, // No cambiado
      });

      // Verificar que se mantuvo el email original
      expect(response.body.data.email).toBe(usuarioParaActualizar.user.email);
      
      logStepV3('✅ Usuario actualizado exitosamente',{
        etiqueta: "update user - admin"
      });
    });

    it('debe permitir al administrador cambiar el email de un usuario', async () => {
      // generar email único dinámico para evitar colisiones
      const nuevoEmail = `nuevo.${Date.now().toString(36)}@test.com`;

      const response = await request(server)
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ email: nuevoEmail })
        .expect(200);

      expect(response.body.data.email).toBe(nuevoEmail);
      
      // Verificar que el usuario puede hacer login con el nuevo email
      const loginResponse = await request(server)
        .post('/auth/login')
        .send({
          email: nuevoEmail,
          password: 'cliente123', // Password original
        })
        .expect(200);

      expect(loginResponse.body.data.access_token).toBeDefined();
      
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: usuarioParaActualizar.user.email,
          password: 'cliente123',
        })
        .expect(401);
    });
    
    it('debe permitir al administrador cambiar la contraseña de un usuario', async () => {
      const nuevaPassword = 'nueva_password_123';

      await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ password: nuevaPassword })
        .expect(200);

      // Verificar que el login funciona con la nueva contraseña
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: usuarioParaActualizar.user.email,
          password: nuevaPassword,
        })
        .expect(200);

      expect(loginResponse.body.data.access_token).toBeDefined();
      
      // Verificar que la contraseña anterior ya no funciona
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: usuarioParaActualizar.user.email,
          password: 'cliente123', // Contraseña anterior
        })
        .expect(401);
    });

    it('debe registrar la actualización en los logs del sistema', async () => {
      const datosActualizados = {
        nombre: 'Nombre Para Log',
        telefono: '+1111111111',
      };

      // Actualizar usuario
      await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(datosActualizados)
        .expect(200);

      // Buscar en logs de actualización de usuarios
      const logsResponse = await request(app.getHttpServer())
        .get('/admin/logs?action=update_user')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(logsResponse.body.logs.length).toBeGreaterThan(0);
      
      // Buscar log específico de esta actualización
      const updateLog = logsResponse.body.logs.find(log => 
        log.resourceId === usuarioParaActualizar.user.id && 
        log.userId === usuarios.admin.user.id
      );
      
      expect(updateLog).toBeDefined();
      expect(updateLog.action).toBe('update_user');
      expect(updateLog.level).toBe('info');
      expect(updateLog.message).toContain('actualizó usuario');
    });
    
  });

  afterAll(async () => {
    try {
      // Limpieza de estado estático
      DataFixtures.clearGeneratedPlazaNumbers();
      DataFixtures.clearGeneratedPlacas();
    } finally {
      if (app && typeof app.close === 'function') {
        await app.close();
      }
      if (server && typeof server.close === 'function') {
        // Cierre explícito del socket del servidor para evitar TCPSERVERWRAP
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });
});
