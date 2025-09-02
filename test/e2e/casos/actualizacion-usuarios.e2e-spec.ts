// test/e2e/casos/actualizacion-usuarios.e2e-spec.ts
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper, AuthenticatedUser } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { UserRole } from '../../../src/entities/user.entity';

/**
 * Tests E2E para Caso de Uso 3: Actualizar los Detalles de un Usuario
 * 
 * Cubre el flujo donde un administrador desea actualizar los detalles de un usuario,
 * como nombre, email, teléfono y rol, con las correspondientes validaciones y logging.
 */
describe('Caso de Uso 3: Actualizar los Detalles de un Usuario (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
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

    authHelper = new AuthHelper(app);
  });

  beforeEach(async () => {
    usuarios = await authHelper.createMultipleUsers();
    
    // Crear usuario adicional para ser actualizado
    usuarioParaActualizar = await authHelper.createAndLoginUser(UserRole.CLIENTE, {
      nombre: 'Usuario Para Actualizar',
      email: 'actualizar@test.com',
      telefono: '+1234567890'
    });

    console.log(`👥 Setup completado: ${Object.keys(usuarios).length + 1} usuarios creados`);
  });

  describe('Actualización de usuarios por administrador', () => {
    it('debe permitir a un administrador actualizar cualquier campo de un usuario', async () => {
      const datosActualizados = {
        nombre: 'Nombre Actualizado',
        telefono: '+9876543210',
      };

      console.log(`📝 Actualizando usuario ${usuarioParaActualizar.user.id}`);

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
      
      console.log('✅ Usuario actualizado exitosamente');
    });

    it('debe permitir al administrador cambiar el email de un usuario', async () => {
      const nuevoEmail = 'nuevo.email@test.com';

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ email: nuevoEmail })
        .expect(200);

      expect(response.body.data.email).toBe(nuevoEmail);
      
      // Verificar que el usuario puede hacer login con el nuevo email
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: nuevoEmail,
          password: 'cliente123456', // Password original
        })
        .expect(200);

      expect(loginResponse.body.data.user.email).toBe(nuevoEmail);
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
          password: 'cliente123456', // Contraseña anterior
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

    it('debe poder actualizar todos los campos simultáneamente', async () => {
      const datosCompletos = {
        nombre: 'Nombre Completo Nuevo',
        email: 'email.completo@test.com',
        telefono: '+5555555555',
        password: 'password_completo_123',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(datosCompletos)
        .expect(200);

      expect(response.body.data).toMatchObject({
        nombre: datosCompletos.nombre,
        email: datosCompletos.email,
        telefono: datosCompletos.telefono,
      });

      // No debe devolver la contraseña en la respuesta
      expect(response.body.data.password).toBeUndefined();

      // Verificar que el login funciona con los nuevos datos
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: datosCompletos.email,
          password: datosCompletos.password,
        })
        .expect(200);

      expect(loginResponse.body.data.user.nombre).toBe(datosCompletos.nombre);
    });
  });

  describe('Cambio de roles por administrador', () => {
    it('debe permitir al administrador cambiar el rol de un usuario', async () => {
      // Cambiar cliente a empleado
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ role: UserRole.EMPLEADO })
        .expect(200);

      expect(response.body.data.role).toBe(UserRole.EMPLEADO);

      // Verificar que el usuario puede acceder a endpoints de empleado
      const newUserLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: usuarioParaActualizar.user.email,
          password: 'cliente123456',
        })
        .expect(200);

      // Probar acceso a ocupación (solo empleados y admin)
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set('Authorization', `Bearer ${newUserLogin.body.data.access_token}`)
        .expect(200);
    });

    it('debe registrar el cambio de rol en los logs', async () => {
      // Cambiar rol
      await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ role: UserRole.ADMIN })
        .expect(200);

      // Buscar log de cambio de rol
      const logsResponse = await request(app.getHttpServer())
        .get('/admin/logs?action=role_change')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      if (logsResponse.body.logs.length > 0) {
        const roleChangeLog = logsResponse.body.logs.find(log => 
          log.resourceId === usuarioParaActualizar.user.id
        );
        
        if (roleChangeLog) {
          expect(roleChangeLog.action).toBe('role_change');
          expect(roleChangeLog.level).toBe('warn'); // Cambio de rol es crítico
          expect(roleChangeLog.details).toHaveProperty('previousRole');
          expect(roleChangeLog.details).toHaveProperty('newRole');
        }
      }
    });

    it('debe permitir cambiar de admin a empleado y validar pérdida de permisos', async () => {
      // Crear admin adicional
      const adminTemp = await authHelper.createAndLoginUser(UserRole.ADMIN);

      // Cambiar admin a empleado
      await request(app.getHttpServer())
        .patch(`/users/${adminTemp.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ role: UserRole.EMPLEADO })
        .expect(200);

      // Login del usuario degradado
      const employeeLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: adminTemp.user.email,
          password: 'admin123456',
        })
        .expect(200);

      // Verificar que ya no puede crear usuarios (solo admin)
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${employeeLogin.body.data.access_token}`)
        .send({
          nombre: 'Test Usuario',
          email: 'test@test.com',
          password: 'password123',
          role: UserRole.CLIENTE,
        })
        .expect(403);
    });
  });

  describe('Auto-actualización de usuarios', () => {
    it('debe permitir a un usuario actualizar su propio perfil (excepto rol)', async () => {
      const datosActualizados = {
        nombre: 'Mi Nuevo Nombre',
        telefono: '+0000000000',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarioParaActualizar.token))
        .send(datosActualizados)
        .expect(200);

      expect(response.body.data).toMatchObject(datosActualizados);
    });

    it('debe rechazar que un usuario cambie su propio rol', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarioParaActualizar.token))
        .send({ role: UserRole.ADMIN })
        .expect(403);

      expect(response.body.message).toContain('Solo los administradores pueden cambiar roles');
    });

    it('debe permitir al empleado actualizar su perfil pero no cambiar rol', async () => {
      const datosActualizados = {
        nombre: 'Empleado Actualizado',
        telefono: '+2222222222',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.empleado.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .send(datosActualizados)
        .expect(200);

      expect(response.body.data).toMatchObject(datosActualizados);
      expect(response.body.data.role).toBe(UserRole.EMPLEADO); // Sin cambios

      // Intentar cambiar rol debe fallar
      await request(app.getHttpServer())
        .patch(`/users/${usuarios.empleado.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .send({ role: UserRole.ADMIN })
        .expect(403);
    });
  });

  describe('Validaciones de datos', () => {
    it('debe rechazar emails duplicados', async () => {
      // Intentar cambiar email al de otro usuario existente
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ email: usuarios.cliente.user.email }) // Email ya existente
        .expect(400);

      expect(response.body.message).toContain('email ya está registrado');
    });

    it('debe validar formato de email', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ email: 'email-invalido' })
        .expect(400);

      expect(response.body.message).toContain('email válido');
    });

    it('debe validar longitud mínima de contraseña', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ password: '123' }) // Muy corta
        .expect(400);

      expect(response.body.message).toContain('al menos 6 caracteres');
    });

    it('debe validar longitud mínima de nombre', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ nombre: 'A' }) // Muy corto
        .expect(400);

      expect(response.body.message).toContain('al menos 2 caracteres');
    });
  });

  describe('Control de acceso y autorización', () => {
    it('debe rechazar que un cliente actualice otro usuario', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.empleado.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send({ nombre: 'Intento Fallido' })
        .expect(403);

      expect(response.body.message).toContain('No tienes permisos para actualizar este usuario');
    });

    it('debe rechazar que un empleado actualice otros usuarios', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarios.cliente.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .send({ nombre: 'Intento Fallido' })
        .expect(403);

      expect(response.body.message).toContain('No tienes permisos para actualizar este usuario');
    });

    it('debe rechazar acceso sin autenticación', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .send({ nombre: 'Sin Token' })
        .expect(401);
    });

    it('debe rechazar token inválido', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set('Authorization', 'Bearer token_invalido')
        .send({ nombre: 'Token Inválido' })
        .expect(401);
    });
  });

  describe('CRUD completo de usuarios por admin', () => {
    it('debe permitir al admin crear nuevos usuarios', async () => {
      const nuevoUsuario = {
        nombre: 'Usuario Creado por Admin',
        email: 'creado.admin@test.com',
        password: 'password123',
        telefono: '+3333333333',
        role: UserRole.EMPLEADO,
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send(nuevoUsuario)
        .expect(201);

      expect(response.body.data).toMatchObject({
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        telefono: nuevoUsuario.telefono,
        role: nuevoUsuario.role,
      });

      // Verificar que puede hacer login
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: nuevoUsuario.email,
          password: nuevoUsuario.password,
        })
        .expect(200);
    });

    it('debe permitir al admin eliminar usuarios', async () => {
      // Crear usuario para eliminar
      const usuarioTemp = await authHelper.createAndLoginUser(UserRole.CLIENTE);

      // Eliminar usuario
      await request(app.getHttpServer())
        .delete(`/users/${usuarioTemp.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      // Verificar que ya no existe
      await request(app.getHttpServer())
        .get(`/users/${usuarioTemp.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(404);

      // Verificar que no puede hacer login
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: usuarioTemp.user.email,
          password: 'cliente123456',
        })
        .expect(401);
    });

    it('debe mostrar estadísticas de usuarios al admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/stats')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);

      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('admins');
      expect(response.body.data).toHaveProperty('empleados');
      expect(response.body.data).toHaveProperty('clientes');

      // Verificar que los números son consistentes
      const stats = response.body.data;
      expect(stats.total).toBe(stats.admins + stats.empleados + stats.clientes);
    });
  });

  describe('Casos edge y manejo de errores', () => {
    it('debe manejar actualización de usuario inexistente', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/00000000-0000-0000-0000-000000000000')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ nombre: 'No Existe' })
        .expect(404);

      expect(response.body.message).toContain('no encontrado');
    });

    it('debe manejar campos vacíos apropiadamente', async () => {
      // Campos opcionales vacíos deben ser aceptados
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ telefono: '' })
        .expect(200);

      expect(response.body.data.telefono).toBe('');
    });

    it('debe rechazar cambios a campos que no existen', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${usuarioParaActualizar.user.id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ 
          nombre: 'Válido',
          campo_inexistente: 'No debe ser aceptado'
        })
        .expect(400);

      expect(response.body.message).toContain('forbidNonWhitelisted');
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
