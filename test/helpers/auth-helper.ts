// test/helpers/auth-helper.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '../../src/entities/user.entity';
import { logStepV3 } from './log-util';
import { DataFixtures } from './data-fixtures';

export interface AuthenticatedUser {
  user: {
    id: string;
    email: string;
    nombre: string;
    role: UserRole;
  };
  token: string;
}

export class AuthHelper {
  // NUEVO: instancia de DataFixtures para delegar creación de vehículos
  private dataFixtures: DataFixtures;

  constructor(private app: INestApplication) {
    this.dataFixtures = new DataFixtures(app);
  }

  /**
   * Crear un cliente con un vehículo asociado
   * Útil para tests que requieren un cliente con vehículo.
   * EDITADO: delega la creación de vehículo a DataFixtures.createVehiculo
   */
  async createClienteWithVehiculo(): Promise<{
    cliente: AuthenticatedUser;
    vehiculo: any;
  }> {
    // 1) Crear cliente y obtener token
    const cliente = await this.createAndLoginUser(UserRole.CLIENTE);

    // 2) Crear vehículo delegando al helper centralizado
    try {
      const vehiculo = await this.dataFixtures.createVehiculo(
        cliente.user.id,
        cliente.token,
        {}
      );

      return { cliente, vehiculo };
    } catch (error: any) {
      const serverBody = error?.response?.body ?? error?.response ?? error?.message;
      logStepV3('❌ Error creando vehículo en createClienteWithVehiculo', {
        etiqueta: 'HELPER',
        tipo: 'error',
      }, serverBody);
      throw error;
    }
  }

  /**
   * Crear y hacer login de un usuario de prueba
   */
  async createAndLoginUser(
    role: UserRole = UserRole.CLIENTE,
    customData: Partial<{
      nombre: string;
      email: string;
      telefono: string;
    }> = {}
  ): Promise<AuthenticatedUser> {
    const timestamp = Date.now();
    const baseEmail = customData.email || `test-${role.toLowerCase()}-${timestamp}@test.com`;

    const userData = {
      nombre: customData.nombre || `Test ${role}`,
      email: baseEmail,
      password: this.getDefaultPassword(role),
      telefono: customData.telefono || '+123456789',
    };

    // Registrar usuario
    const registerResponse = await request(this.app.getHttpServer())
      .post('/auth/register')
      .send(userData)
      .expect(201);

    // Si no es cliente, actualizar el rol (requiere admin)
    let userResponse = registerResponse;
    if (role !== UserRole.CLIENTE) {
      const adminToken = await this.getAdminToken();

      await request(this.app.getHttpServer())
        .patch(`/users/${registerResponse.body.data.user.id}`)
        .set(this.getAuthHeader(adminToken))
        .send({ role })
        .expect(200);

      // Re-login
      userResponse = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        })
        .expect(200);
    }

    return {
      user: userResponse.body.data.user,
      token: userResponse.body.data.access_token,
    };
  }

  /**
   * Crear múltiples usuarios de diferentes roles
   */
  async createMultipleUsers(): Promise<{
    admin: AuthenticatedUser;
    empleado: AuthenticatedUser;
    cliente: AuthenticatedUser;
  }> {
    const timestamp = Date.now();

    const [admin, empleado, cliente] = await Promise.all([
      this.createAndLoginUser(UserRole.ADMIN, {
        email: `admin-${timestamp}@test.com`,
        nombre: 'Admin Test',
      }),
      this.createAndLoginUser(UserRole.EMPLEADO, {
        email: `empleado-${timestamp}@test.com`,
        nombre: 'Empleado Test',
      }),
      this.createAndLoginUser(UserRole.CLIENTE, {
        email: `cliente-${timestamp}@test.com`,
        nombre: 'Cliente Test',
      }),
    ]);

    return { admin, empleado, cliente };
  }

  /**
   * Obtener token del administrador predeterminado del sistema
   * Mejorado con reintentos y mejor manejo de errores
   */
  async getAdminToken(maxRetries = 5): Promise<string> {
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        const response = await request(this.app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'admin@parking.com',
            password: 'admin123',
          })
          .timeout(15000)
          .expect(200);

        // Extracción flexible del token
        const token =
          response.body.data?.access_token ||
          response.body.access_token ||
          response.body.data?.token;

        if (token) {
          return token;
        }

        throw new Error('Token no encontrado en la respuesta del servidor');
      } catch (error: any) {
        attempts++;
        if (attempts >= maxRetries) {
          throw new Error(`Failed to get admin token after ${maxRetries} attempts: ${error.message}`);
        }

        const delayMs = 1000 * Math.pow(2, attempts);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error('Unexpected flow in getAdminToken');
  }

  /**
   * Validar que un token funciona correctamente
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await request(this.app.getHttpServer())
        .get('/auth/profile')
        .set(this.getAuthHeader(token))
        .timeout(5000)
        .expect(200);

      return response.body.success === true;
    } catch {
      return false;
    }
  }

  /**
   * Obtener token del empleado predeterminado del sistema
   */
  async getEmpleadoToken(): Promise<string> {
    try {
      const response = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'empleado@parking.com',
          password: 'empleado123',
        })
        .expect(200);

      return response.body.data.access_token;
    } catch (error: any) {
      throw new Error(`No se pudo obtener token de empleado: ${error.message}`);
    }
  }

  /**
   * Obtener token del cliente predeterminado del sistema
   */
  async getClienteToken(): Promise<string> {
    try {
      const response = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'cliente@parking.com',
          password: 'cliente123',
        })
        .expect(200);

      return response.body.data.access_token;
    } catch (error: any) {
      throw new Error(`No se pudo obtener token de cliente: ${error.message}`);
    }
  }

  /**
   * Generar headers de autorización para requests
   */
  getAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Hacer login con credenciales específicas
   */
  async login(email: string, password: string): Promise<string> {
    const response = await request(this.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.access_token;
  }

  /**
   * Verificar que un token es válido
   */
  async verifyToken(token: string): Promise<boolean> {
    try {
      await request(this.app.getHttpServer())
        .get('/auth/profile')
        .set(this.getAuthHeader(token))
        .expect(200);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtener información del usuario autenticado
   */
  async getUserInfo(token: string): Promise<any> {
    const response = await request(this.app.getHttpServer())
      .get('/auth/profile')
      .set(this.getAuthHeader(token))
      .expect(200);

    return response.body.data.user;
  }

  /**
   * Limpiar usuarios de prueba (opcional)
   */
  async cleanupUsers(adminToken: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      try {
        await request(this.app.getHttpServer())
          .delete(`/users/${userId}`)
          .set(this.getAuthHeader(adminToken));
      } catch {
        // Ignorar errores de limpieza
      }
    }
  }

  // MÉTODOS PRIVADOS

  /**
   * Obtener contraseña por defecto según el rol
   */
  private getDefaultPassword(role: UserRole): string {
    const passwords = {
      [UserRole.ADMIN]: 'admin123',
      [UserRole.EMPLEADO]: 'empleado123',
      [UserRole.CLIENTE]: 'cliente123',
    };

    return passwords[role] || 'default123';
  }

  /**
   * Generar email único para tests
   */
  private generateUniqueEmail(role: UserRole): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    return `test-${role.toLowerCase()}-${timestamp}-${randomSuffix}@test.com`;
  }

  /**
   * OBSOLETO: Generar placa válida.
   * Mantenido por compatibilidad; la creación de vehículos ahora delega a DataFixtures.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateValidPlaca(): string {
    const timestamp = Date.now().toString().slice(-6);
    const prefix = 'TST';
    const placa = `${prefix}${timestamp}`;
    return placa;
  }
}
