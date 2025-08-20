import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '../../src/entities/user.entity';

export class AuthHelper {
  constructor(private app: INestApplication) {}

  async createAndLoginUser(role: UserRole, userData?: Partial<any>): Promise<{
    user: any;
    token: string;
  }> {
    // Datos por defecto para cada tipo de usuario
    const defaultUserData = {
      [UserRole.ADMIN]: {
        nombre: 'Admin Test',
        email: 'admin@test.com',
        password: 'admin123456',
        telefono: '+1234567890',
        role: UserRole.ADMIN,
      },
      [UserRole.EMPLEADO]: {
        nombre: 'Empleado Test',
        email: 'empleado@test.com',
        password: 'empleado123456',
        telefono: '+1234567891',
        role: UserRole.EMPLEADO,
      },
      [UserRole.CLIENTE]: {
        nombre: 'Cliente Test',
        email: 'cliente@test.com',
        password: 'cliente123456',
        telefono: '+1234567892',
        role: UserRole.CLIENTE,
      },
    };

    const userToCreate = {
      ...defaultUserData[role],
      ...userData,
    };

    // Registrar usuario
    const registerResponse = await request(this.app.getHttpServer())
      .post('/auth/register')
      .send(userToCreate)
      .expect(201);

    // Hacer login
    const loginResponse = await request(this.app.getHttpServer())
      .post('/auth/login')
      .send({
        email: userToCreate.email,
        password: userToCreate.password,
      })
      .expect(200);

    return {
      user: registerResponse.body.data.user,
      token: loginResponse.body.data.access_token,
    };
  }

  async createMultipleUsers(): Promise<{
    admin: { user: any; token: string };
    empleado: { user: any; token: string };
    cliente: { user: any; token: string };
  }> {
    const [admin, empleado, cliente] = await Promise.all([
      this.createAndLoginUser(UserRole.ADMIN),
      this.createAndLoginUser(UserRole.EMPLEADO),
      this.createAndLoginUser(UserRole.CLIENTE),
    ]);

    return { admin, empleado, cliente };
  }

  getAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }
}