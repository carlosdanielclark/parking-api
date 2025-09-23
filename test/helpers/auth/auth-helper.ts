// Archivo: test/helpers/auth/auth-helper.ts
// MODIFICADO - Movido a subcarpeta auth/, manteniendo funcionalidad
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '../../../src/entities/user.entity';
import { logStepV3 } from '../log/log-util';
import { DataFixtures } from '../data/data-fixtures';

export interface AuthenticatedUser {
  user: { id: string; email: string; nombre: string; role: UserRole };
  token: string;
}

export class AuthHelper {
  private dataFixtures: DataFixtures;

  constructor(private app: INestApplication) {
    this.dataFixtures = new DataFixtures(app);
  }

  /**
   * NUEVO - doLoginWithRetry
   * Realiza POST /auth/login con reintentos focalizados en ECONNRESET.
   * Devuelve el objeto response de supertest (para extraer tokens, etc.).
   * Aumentado el delay entre reintentos para mayor estabilidad
   */
  private async doLoginWithRetry(
    payload: { email: string; password: string },
    maxRetries = 3, // Aumentado a 3 reintentos
    delayMs = 300   // Aumentado delay a 300ms
  ): Promise<request.Response> {
    let attempt = 0;
    while (true) {
      try {
        return await request(this.app.getHttpServer())
          .post('/auth/login')
          .send(payload)
          .timeout(20000)
          .expect(200);
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (attempt < maxRetries && /ECONNRESET/i.test(msg)) {
          attempt++;
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
  }


  async createClienteWithVehiculo(): Promise<{ cliente: AuthenticatedUser; vehiculo: any }> {
    const cliente = await this.createAndLoginUser(UserRole.CLIENTE);
    try {
      const vehiculo = await this.dataFixtures.createVehiculo(cliente.user.id, cliente.token, {});
      return { cliente, vehiculo };
    } catch (error: any) {
      const serverBody = error?.response?.body ?? error?.response ?? error?.message;
      logStepV3('❌ Error creando vehículo en createClienteWithVehiculo', {
        etiqueta: 'AUTH_HELPER',
        tipo: 'error',
      }, serverBody.message);
      throw error;
    }
  }

  async createAndLoginUser(
    role: UserRole = UserRole.CLIENTE,
    customData: Partial<{ nombre: string; email: string; telefono: string }> = {}
  ): Promise<AuthenticatedUser> {
    const timestamp = Date.now();
    const baseEmail = customData.email || `test-${role.toLowerCase()}-${timestamp}@test.com`;

    const userData = {
      nombre: customData.nombre || `Test ${role}`,
      email: baseEmail,
      password: this.getDefaultPassword(role),
      telefono: customData.telefono || '+123456789',
    };

    const registerResponse = await request(this.app.getHttpServer())
      .post('/auth/register')
      .send(userData)
      .timeout(20000)
      .expect(201);

    if (role !== UserRole.CLIENTE) {
      const adminToken = await this.getAdminToken();

      await request(this.app.getHttpServer())
        .patch(`/users/${registerResponse.body.data.user.id}`)
        .set(this.getAuthHeader(adminToken))
        .send({ role })
        .timeout(20000)
        .expect(200);

      const userResponse = await this.doLoginWithRetry({ email: userData.email, password: userData.password });

      return { user: userResponse.body.data.user, token: userResponse.body.data.access_token };
    }

    return { user: registerResponse.body.data.user, token: registerResponse.body.data.access_token };
  }

  async createMultipleUsers(): Promise<{ admin: AuthenticatedUser; empleado: AuthenticatedUser; cliente: AuthenticatedUser }> {
    const timestamp = Date.now();
    const [admin, empleado, cliente] = await Promise.all([
      this.createAndLoginUser(UserRole.ADMIN, { email: `admin-${timestamp}@test.com`, nombre: 'Admin Test' }),
      this.createAndLoginUser(UserRole.EMPLEADO, { email: `empleado-${timestamp}@test.com`, nombre: 'Empleado Test' }),
      this.createAndLoginUser(UserRole.CLIENTE, { email: `cliente-${timestamp}@test.com`, nombre: 'Cliente Test' }),
    ]);
    return { admin, empleado, cliente };
  }

  async getAdminToken(maxRetries = 5): Promise<string> {
    let attempts = 0;
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    while (attempts < maxRetries) {
      try {
        const res = await request(this.app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'admin@parking.com', password: 'admin123' })
          .timeout(15000)
          .expect((r) => {
            if (r.status !== 200) throw new Error(`Login admin status=${r.status}`);
          });

        const token = res.body.data?.access_token || res.body.access_token || res.body.data?.token;
        if (!token) throw new Error('Token no encontrado en respuesta de login admin');
        return token;
      } catch (err: any) {
        attempts++;
        if (attempts >= maxRetries) {
          throw new Error(`No se obtuvo token admin tras ${maxRetries} intentos: ${err.message}`);
        }
        await delay(1000);
      }
    }
    throw new Error('Flujo inesperado getAdminToken');
  }

  async login(email: string, password: string): Promise<string> {
    const res = await this.doLoginWithRetry({ email, password }, 2, 150);
    return res.body.data.access_token;
  }

  async getEmpleadoToken(): Promise<string> {
    const res = await this.doLoginWithRetry({ email: 'empleado@parking.com', password: 'empleado123' }, 2, 150);
    return res.body.data.access_token;
  }

  async getClienteToken(): Promise<string> {
    const res = await this.doLoginWithRetry({ email: 'cliente@parking.com', password: 'cliente123' }, 2, 150);
    return res.body.data.access_token;
  }

  getAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

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

  async getUserInfo(token: string): Promise<any> {
    const response = await request(this.app.getHttpServer())
      .get('/auth/profile')
      .set(this.getAuthHeader(token))
      .expect(200);
    return response.body.data.user;
  }

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

  private getDefaultPassword(role: UserRole): string {
    const passwords = {
      [UserRole.ADMIN]: 'admin123',
      [UserRole.EMPLEADO]: 'empleado123',
      [UserRole.CLIENTE]: 'cliente123',
    } as Record<UserRole, string>;
    return passwords[role] || 'default123';
  }

  // OBSOLETO: kept for compatibility - usar DataFixtures.generateValidPlaca() o IdUniqueness.genPlaca()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateValidPlaca(): string {
    const timestamp = Date.now().toString().slice(-6);
    const prefix = 'TST';
    const placa = `${prefix}${timestamp}`;
    return placa;
  }
}
