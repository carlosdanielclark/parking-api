import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper } from '../../helpers/auth-helper';
import { UserRole } from '../../../src/entities/user.entity';

describe('Caso de Uso 3: Actualizar Detalles de Usuario (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let usuarios: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authHelper = new AuthHelper(app);
  });

  beforeEach(async () => {
    usuarios = await authHelper.createMultipleUsers();
  });

  describe('Actualización por administrador', () => {
    it('debe permitir al admin actualizar información básica de un usuario', async () => {
      const updateData = {
        nombre: 'Cliente Actualizado',
        telefono: '987654321',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: usuarios.cliente.user.id,
        nombre: 'Cliente Actualizado',
        telefono: '987654321',
        email: usuarios.cliente.user.email,
      });
    });

    it('debe permitir al admin cambiar el email de un usuario', async () => {
      const updateData = {
        email: 'nuevo-email@test.com',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(200);

      expect(response.body.data.email).toBe('nuevo-email@test.com');
    });

    it('debe permitir al admin cambiar el rol de un usuario', async () => {
      const updateData = {
        role: UserRole.EMPLEADO,
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(200);

      expect(response.body.data.role).toBe(UserRole.EMPLEADO);
    });

    it('debe registrar la actualización en los logs del sistema', async () => {
      const updateData = {
        nombre: 'Cliente Logged Update',
        telefono: '111222333',
      };

      await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(200);

      // Esperar a que se procese el log
      await new Promise(resolve => setTimeout(resolve, 1000));

      const logsResponse = await request(app.getHttpServer())
        .get(`/logs?action=update_user&userId=${usuarios.admin.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(logsResponse.body.data.logs.length).toBeGreaterThan(0);
      
      const updateLog = logsResponse.body.data.logs.find(log => 
        log.action === 'update_user' && 
        log.resourceId === usuarios.cliente.user.id
      );
      
      expect(updateLog).toBeDefined();
      expect(updateLog.details).toHaveProperty('previousState');
      expect(updateLog.details).toHaveProperty('newState');
    });

    it('debe registrar cambios de rol como eventos críticos', async () => {
      const updateData = {
        role: UserRole.EMPLEADO,
      };

      await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const logsResponse = await request(app.getHttpServer())
        .get('/logs?action=role_change')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(logsResponse.body.data.logs.length).toBeGreaterThan(0);
      
      const roleChangeLog = logsResponse.body.data.logs[0];
      expect(roleChangeLog.level).toBe('warn'); // Cambios de rol son WARN
      expect(roleChangeLog.details).toMatchObject({
        previous_role: UserRole.CLIENTE,
        new_role: UserRole.EMPLEADO,
        changed_by: usuarios.admin.user.id,
      });
    });
  });

  describe('Auto-actualización de usuarios', () => {
    it('debe permitir a un usuario actualizar su propia información básica', async () => {
      const updateData = {
        nombre: 'Auto Actualizado',
        telefono: '555666777',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(updateData)
        .expect(200);

      expect(response.body.data).toMatchObject({
        nombre: 'Auto Actualizado',
        telefono: '555666777',
      });
    });

    it('debe permitir a un usuario cambiar su propia contraseña', async () => {
      const updateData = {
        password: 'nueva-contraseña-segura-123',
      };

      await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(updateData)
        .expect(200);

      // Verificar que puede hacer login con la nueva contraseña
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: usuarios.cliente.user.email,
          password: 'nueva-contraseña-segura-123',
        })
        .expect(200);

      expect(loginResponse.body.data).toHaveProperty('access_token');
    });

    it('no debe permitir a un usuario cambiar su propio rol', async () => {
      const updateData = {
        role: UserRole.ADMIN, // Intentar elevarse a admin
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(updateData)
        .expect(403);

      expect(response.body.message).toContain('Solo los administradores pueden cambiar roles');
    });

    it('no debe permitir a un usuario actualizar otro usuario', async () => {
      const otroCliente = await authHelper.createAndLoginUser(UserRole.CLIENTE, {
        email: 'otro-cliente@test.com'
      });

      const updateData = {
        nombre: 'Intento de Actualización Maliciosa',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${otroCliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(updateData)
        .expect(403);

      expect(response.body.message).toContain('No tienes permisos para actualizar este usuario');
    });
  });

  describe('Validaciones de datos', () => {
    it('debe rechazar emails duplicados', async () => {
      const updateData = {
        email: usuarios.empleado.user.email, // Email que ya existe
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(400);

      expect(response.body.message).toContain('email ya está registrado');
    });

    it('debe validar formato de email', async () => {
      const updateData = {
        email: 'email-invalido', // Formato inválido
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(400);

      expect(response.body.message).toContain('email válido');
    });

    it('debe validar longitud mínima de contraseña', async () => {
      const updateData = {
        password: '123', // Muy corta
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(updateData)
        .expect(400);

      expect(response.body.message).toContain('al menos 6 caracteres');
    });

    it('debe validar roles válidos', async () => {
      const updateData = {
        role: 'rol_inexistente' as any,
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(updateData)
        .expect(400);

      expect(response.body.message).toContain('rol debe ser');
    });
  });

  describe('Protecciones de seguridad', () => {
    it('debe rechazar actualizaciones sin autenticación', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .send({ nombre: 'Sin Autenticacion' })
        .expect(401);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});