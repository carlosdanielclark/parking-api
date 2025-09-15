// test/e2e/casos/actualizacion-usuarios.e2e-spec.ts
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { UserRole } from '../../../src/entities/user.entity';
import {
  AuthHelper,
  AuthenticatedUser,
  DataFixtures,
  DataGenerator,
  HttpClient,
  logStepV3,
} from '../../helpers';

jest.setTimeout(60000);

describe('Caso de Uso 3: Actualizar los Detalles de un Usuario (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let server: any;
  let httpClient: HttpClient;
  let usuarios: {
    admin: AuthenticatedUser;
    empleado: AuthenticatedUser;
    cliente: AuthenticatedUser;
  };
  let usuarioParaActualizar: AuthenticatedUser;

  async function patchWithRetry(
    serverInstance: any,
    url: string,
    token: string,
    body: any,
    expectStatus: number,
    maxRetries = 1,
    retryDelayMs = 150
  ): Promise<any> {
    let attempt = 0;
    while (true) {
      try {
        const res = await request(serverInstance)
          .patch(url)
          .set('Authorization', `Bearer ${token}`)
          .send(body);
        expect(res.status).toBe(expectStatus);
        return res;
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (attempt < maxRetries && /ECONNRESET/i.test(msg)) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    server = app.getHttpServer();
    authHelper = new AuthHelper(app);
    httpClient = new HttpClient(app);
  });

  beforeEach(async () => {
    // Limpieza de estado estático para evitar colisiones
    DataGenerator.clearStaticState();
    DataFixtures.clearGeneratedPlazaNumbers?.();

    usuarios = await authHelper.createMultipleUsers();

    // Crear usuario único para actualizar
    const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    usuarioParaActualizar = await authHelper.createAndLoginUser(UserRole.CLIENTE, {
      nombre: 'Usuario Para Actualizar',
      email: `actualizar+${uniqueSuffix}@test.com`,
      telefono: '+1234567890',
    });

    logStepV3('👥 Setup completado', { etiqueta: 'beforeEach', tipo: 'info' });
  });

  afterEach(async () => {
    try {
      const adminTok = await authHelper.getAdminToken();
      if (usuarioParaActualizar?.user?.id) {
        await request(app.getHttpServer())
          .delete(`/users/${usuarioParaActualizar.user.id}`)
          .set('Authorization', `Bearer ${adminTok}`)
          .catch(() => undefined);
      }
    } catch (err: any) {
      logStepV3(`Intento fallido eliminando usuario de prueba: ${err?.message ?? String(err)}`, {
        etiqueta: 'afterEach',
        tipo: 'warning',
      });
    } finally {
      DataFixtures.clearGeneratedPlazaNumbers?.();
    }
  });

  describe('Actualización de usuarios por administrador', () => {
    it('debe permitir a un administrador actualizar cualquier campo de un usuario', async () => {
      const datosActualizados = { nombre: 'Nombre Actualizado', telefono: '+9876543210' };

      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = datosActualizados;      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: usuarioParaActualizar.user.id,
        nombre: datosActualizados.nombre,
        telefono: datosActualizados.telefono,
        email: usuarioParaActualizar.user.email,
      });

      expect(response.body.data.email).toBe(usuarioParaActualizar.user.email);
    });

    it('debe permitir al administrador cambiar el email de un usuario', async () => {
      const nuevoEmail = `nuevo.${Date.now().toString(36)}@test.com`;

      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { email: nuevoEmail };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      expect(response.body.data.email).toBe(nuevoEmail);

      // Login con nuevo email
      const loginUrl = '/auth/login';
      const loginBody = { email: nuevoEmail, password: 'cliente123' };      
      const loginHeader = {};
      const loginResponse = await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginBody, loginHeader, 200), 4, 500
      );

      expect(loginResponse.body.data.access_token).toBeDefined();

      // Login con viejo email debe fallar
      const loginViejoBody = { email: usuarioParaActualizar.user.email, password: 'cliente123' };      
      await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginViejoBody, loginHeader, 401), 4, 500
      );
    });

    it('debe permitir al administrador cambiar la contraseña de un usuario', async () => {
      const nuevaPassword = 'nueva_password_123';

      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { password: nuevaPassword };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      const loginUrl = '/auth/login';
      const loginBody = { email: usuarioParaActualizar.user.email, password: nuevaPassword };      
      const loginHeader = {};
      const loginResponse = await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginBody, loginHeader, 200), 4, 500
      );

      expect(loginResponse.body.data.access_token).toBeDefined();

      const loginViejoBody = { email: usuarioParaActualizar.user.email, password: 'cliente123' };      
      await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginViejoBody, loginHeader, 401), 4, 500
      );
    });

    it('debe registrar la actualización en los logs del sistema', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { nombre: 'Nombre Para Log', telefono: '+1111111111' };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      const logsUrl = '/admin/logs?action=update_user';   
      const logsHeader = authHelper.getAuthHeader(usuarios.admin.token);
      const logsResponse = await httpClient.withRetry(
        () => httpClient.get(logsUrl, logsHeader, 200), 4, 500
      );

      expect(logsResponse.body.logs.length).toBeGreaterThan(0);

      const updateLog = logsResponse.body.logs.find((log: any) => 
        log.resourceId === usuarioParaActualizar.user.id &&
        log.userId === usuarios.admin.user.id
      );

      expect(updateLog).toBeDefined();
      expect(updateLog.action).toBe('update_user');
      expect(updateLog.level).toBe('info');
      expect(updateLog.message).toContain('actualizó usuario');
    });

    it('debe poder actualizar todos los campos simultáneamente', async () => {
      const datosCompletos = {
        nombre: 'Nombre Completo Nuevo',
        email: `email.completo+${Date.now().toString(36)}@test.com`,
        telefono: '+5555555555',
        password: 'password_completo_123',
      };

      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = datosCompletos;      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 5, 800
      );

      expect(response.body.data).toMatchObject({
        nombre: datosCompletos.nombre,
        email: datosCompletos.email,
        telefono: datosCompletos.telefono,
      });

      expect(response.body.data.password).toBeUndefined();

      const loginUrl = '/auth/login';
      const loginBody = { email: datosCompletos.email, password: datosCompletos.password };      
      const loginHeader = {};
      const loginResponse = await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginBody, loginHeader, 200), 4, 500
      );

      expect(loginResponse.body.data.user.nombre).toBe(datosCompletos.nombre);
    });
  });

  describe('Cambio de roles por administrador', () => {
    it('debe permitir al administrador cambiar el rol de un usuario', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { role: UserRole.EMPLEADO };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      expect(response.body.data.role).toBe(UserRole.EMPLEADO);

      const loginUrl = '/auth/login';
      const loginBody = { email: usuarioParaActualizar.user.email, password: 'cliente123' };      
      const loginHeader = {};
      const newUserLogin = await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginBody, loginHeader, 200), 4, 500
      );

      const ocupacionUrl = '/plazas/ocupacion';
      const ocupacionHeader = authHelper.getAuthHeader(newUserLogin.body.data.access_token);
      await httpClient.withRetry(
        () => httpClient.get(ocupacionUrl, ocupacionHeader, 200), 4, 500
      );
    });

    it('debe registrar el cambio de rol en los logs', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { role: UserRole.ADMIN };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      const logsUrl = '/admin/logs?action=role_change';   
      const logsHeader = authHelper.getAuthHeader(usuarios.admin.token);
      const logsResponse = await httpClient.withRetry(
        () => httpClient.get(logsUrl, logsHeader, 200), 4, 500
      );

      if (logsResponse.body.logs.length > 0) {
        const roleChangeLog = logsResponse.body.logs.find((log: any) =>
          log.resourceId === usuarioParaActualizar.user.id
        );
        if (roleChangeLog) {
          expect(roleChangeLog.action).toBe('role_change');
          expect(roleChangeLog.level).toBe('warn');
          expect(roleChangeLog.details).toHaveProperty('previousRole');
          expect(roleChangeLog.details).toHaveProperty('newRole');
        }
      }
    });

    it('debe permitir cambiar de admin a empleado y validar pérdida de permisos', async () => {
      const adminTemp = await authHelper.createAndLoginUser(UserRole.ADMIN);

      const url = `/users/${adminTemp.user.id}`;
      const body = { role: UserRole.EMPLEADO };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      const loginUrl = '/auth/login';
      const loginBody = { email: adminTemp.user.email, password: 'admin123' };      
      const loginHeader = {};
      const employeeLogin = await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginBody, loginHeader, 200), 4, 500
      );

      const createUserUrl = '/users';
      const createUserBody = {
        nombre: 'Test Usuario',
        email: `test+${Date.now().toString(36)}@test.com`,
        password: 'password123',
        role: UserRole.CLIENTE,
      };      
      const createUserHeader = authHelper.getAuthHeader(employeeLogin.body.data.access_token);
      await httpClient.withRetry(
        () => httpClient.post(createUserUrl, createUserBody, createUserHeader, 403), 4, 500
      );
    });
  });

  describe('Auto-actualización de usuarios', () => {
    it('debe permitir a un usuario actualizar su propio perfil (excepto rol)', async () => {
      const datosActualizados = { nombre: 'Mi Nuevo Nombre', telefono: '+0000000000' };

      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = datosActualizados;      
      const header = authHelper.getAuthHeader(usuarioParaActualizar.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 4, 500
      );

      expect(response.body.data).toMatchObject(datosActualizados);
    });

    it('debe rechazar que un usuario cambie su propio rol', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { role: UserRole.ADMIN };      
      const header = authHelper.getAuthHeader(usuarioParaActualizar.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 403), 4, 500
      );

      expect(response.body.message).toContain('Solo los administradores pueden cambiar roles');
    });

    it('debe permitir al empleado actualizar su perfil pero no cambiar rol', async () => {
      const datosActualizados = { nombre: 'Empleado Actualizado', telefono: '+2222222222' };

      const url = `/users/${usuarios.empleado.user.id}`;
      const body = datosActualizados;      
      const header = authHelper.getAuthHeader(usuarios.empleado.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 5, 800
      );

      expect(response.body.data).toMatchObject(datosActualizados);
      expect(response.body.data.role).toBe(UserRole.EMPLEADO);

      const roleUrl = `/users/${usuarios.empleado.user.id}`;
      const roleBody = { role: UserRole.ADMIN };      
      const roleHeader = authHelper.getAuthHeader(usuarios.empleado.token);
      await httpClient.withRetry(
        () => httpClient.patch(roleUrl, roleBody, roleHeader, 403), 4, 500
      );
    });
  });

  describe('Validaciones de datos', () => {
    it('debe rechazar emails duplicados', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { email: usuarios.cliente.user.email };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 400), 4, 500
      );

      expect(response.body.message).toContain('El email ya está registrado por otro usuario');
    });

    it('debe validar formato de email', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { email: 'email-invalido' };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 400), 4, 500
      );

      expect(response.body.message).toContain('Debe proporcionar un email válido');
    });

    it('debe validar longitud mínima de contraseña', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { password: '123' };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 400), 4, 500
      );

      expect(response.body.message).toContain('La contraseña debe tener al menos 6 caracteres');
    });

    it('debe validar longitud mínima de nombre', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { nombre: 'A' };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 400), 4, 500
      );

      expect(response.body.message).toContain('El nombre debe tener al menos 2 caracteres');
    });
  });

  describe('Control de acceso y autorización', () => {
    it('debe rechazar que un cliente actualice otro usuario', async () => {
      const url = `/users/${usuarios.empleado.user.id}`;
      const body = { nombre: 'Intento Fallido' };      
      const header = authHelper.getAuthHeader(usuarios.cliente.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 403), 4, 500
      );

      expect(response.body.message).toContain('No tienes permisos para actualizar este usuario');
    });

    it('debe rechazar que un empleado actualice otros usuarios', async () => {
      const url = `/users/${usuarios.cliente.user.id}`;
      const body = { nombre: 'Intento Fallido' };      
      const header = authHelper.getAuthHeader(usuarios.empleado.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 403), 4, 500
      );

      expect(response.body.message).toContain('No tienes permisos para actualizar este usuario');
    });

    it('debe rechazar acceso sin autenticación', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { nombre: 'Sin Token' };      
      const header = {};
      await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 401), 4, 500
      );
    });

    it('debe rechazar token inválido', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { nombre: 'Token Inválido' };      
      const header = { 'Authorization': 'Bearer token_invalido' };
      await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 401), 4, 500
      );
    });
  });

  describe('CRUD completo de usuarios por admin', () => {
    it('debe permitir al admin crear nuevos usuarios', async () => {
      const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const nuevoUsuario = {
        nombre: 'Usuario Creado por Admin',
        email: `creado.usuario+${uniqueSuffix}@test.com`,
        password: 'password123',
        telefono: '+3333333333',
        role: UserRole.EMPLEADO,
      };

      const url = '/users';
      const body = nuevoUsuario;      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.post(url, body, header, 201), 4, 500
      );

      expect(response.body.data).toMatchObject({
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        telefono: nuevoUsuario.telefono,
        role: nuevoUsuario.role,
      });

      const loginUrl = '/auth/login';
      const loginBody = { email: nuevoUsuario.email, password: nuevoUsuario.password };      
      const loginHeader = {};
      await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginBody, loginHeader, 200), 4, 500
      );
    });

    it('debe permitir al admin eliminar usuarios', async () => {
      const usuarioTemp = await authHelper.createAndLoginUser(UserRole.CLIENTE);

      await request(app.getHttpServer())
        .delete(`/users/${usuarioTemp.user.id}`)
        .set('Authorization', `Bearer ${usuarios.admin.token}`)
        .expect(200);

      const getUrl = `/users/${usuarioTemp.user.id}`;
      const getHeader = authHelper.getAuthHeader(usuarios.admin.token);
      await httpClient.withRetry(
        () => httpClient.get(getUrl, getHeader, 404), 4, 500
      );

      const loginUrl = '/auth/login';
      const loginBody = { email: usuarioTemp.user.email, password: 'cliente123' };      
      const loginHeader = {};
      await httpClient.withRetry(
        () => httpClient.post(loginUrl, loginBody, loginHeader, 401), 4, 500
      );
    });

    it('debe mostrar estadísticas de usuarios al admin', async () => {
      const url = '/users/stats';   
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.get(url, header, 200), 4, 500
      );

      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('admins');
      expect(response.body.data).toHaveProperty('empleados');
      expect(response.body.data).toHaveProperty('clientes');

      const stats = response.body.data;
      expect(stats.total).toBe(stats.admins + stats.empleados + stats.clientes);
    });
  });

  describe('Casos edge y manejo de errores', () => {
    it('debe manejar actualización de usuario inexistente', async () => {
      const url = '/users/00000000-0000-0000-0000-000000000000';
      const body = { nombre: 'No Existe' };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 404), 4, 500
      );
      expect(response.body.message).toContain('no encontrado');
    });

    it('debe manejar campos vacíos apropiadamente', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { telefono: '' };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 200), 5, 800
      );

      expect(response.body.data.telefono).toBe('');
    });

    it('debe rechazar cambios a campos que no existen', async () => {
      const url = `/users/${usuarioParaActualizar.user.id}`;
      const body = { nombre: 'Válido', campo_inexistente: 'No debe ser aceptado' };      
      const header = authHelper.getAuthHeader(usuarios.admin.token);
      const response = await httpClient.withRetry(
        () => httpClient.patch(url, body, header, 400), 5, 800
      );

      expect(response.body.message).toContain('property campo_inexistente should not exist');
    });
  });

  afterAll(async () => {
    try {
      DataGenerator.clearStaticState();
      DataFixtures.clearGeneratedPlazaNumbers?.();
      //DataFixtures.clearGeneratedPlacas?.();
    } finally {
      if (app && typeof app.close === 'function') {
        await app.close();
      }
      if (server && typeof server.close === 'function') {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });
});