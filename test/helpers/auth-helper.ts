// test/helpers/auth-helper.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '../../src/entities/user.entity';

export interface TestUser {
  user: {
    id: string;
    nombre: string;
    email: string;
    telefono?: string;
    role: UserRole;
    created_at: string;
    updated_at: string;
  };
  token: string;
}

export interface ClienteWithVehiculo {
  cliente: TestUser;
  vehiculo: {
    id: string;
    placa: string;
    marca?: string;
    modelo?: string;
    color?: string;
    usuario_id: string;
    created_at: string;
  };
}

/**
 * Helper para manejo de autenticación en tests E2E
 * Facilita la creación de usuarios, login y manejo de tokens JWT
 */
export class AuthHelper {
  private static userCounter = 0;

  constructor(private app: INestApplication) {}

  /**
   * Crea y hace login de un usuario con rol específico
   */
  async createAndLoginUser(
    role: UserRole, 
    userData?: Partial<any>
  ): Promise<TestUser> {
    AuthHelper.userCounter++;
    
    // Datos por defecto según el rol
    const defaultUserData = this.getDefaultUserData(role, AuthHelper.userCounter);
    
    const userToCreate = {
      ...defaultUserData,
      ...userData,
    };

    try {
      // 1. Registrar usuario (solo para clientes) o crear vía admin
      let registerResponse;
      
      if (role === UserRole.CLIENTE) {
        // Clientes se registran públicamente
        registerResponse = await request(this.app.getHttpServer())
          .post('/auth/register')
          .send({
            nombre: userToCreate.nombre,
            email: userToCreate.email,
            password: userToCreate.password,
            telefono: userToCreate.telefono,
          })
          .expect(201);
      } else {
        // Empleados y admins necesitan ser creados por un admin existente
        const tempAdmin = await this.getOrCreateSystemAdmin();
        
        registerResponse = await request(this.app.getHttpServer())
          .post('/users')
          .set('Authorization', `Bearer ${tempAdmin.token}`)
          .send(userToCreate)
          .expect(201);
      }

      // 2. Hacer login para obtener el token
      const loginResponse = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: userToCreate.email,
          password: userToCreate.password,
        })
        .expect(200);

      return {
        user: registerResponse.body.data?.user || registerResponse.body.data,
        token: loginResponse.body.data.access_token,
      };

    } catch (error) {
      console.error(`Error creando usuario ${role}:`, error);
      throw error;
    }
  }

  /**
   * Crea múltiples usuarios con roles predefinidos
   */
  async createMultipleUsers(): Promise<{
    admin: TestUser;
    empleado: TestUser;
    cliente: TestUser;
  }> {
    // Crear admin primero (será el admin del sistema)
    const admin = await this.createAndLoginUser(UserRole.ADMIN);
    
    // Crear empleado y cliente en paralelo
    const [empleado, cliente] = await Promise.all([
      this.createAndLoginUser(UserRole.EMPLEADO),
      this.createAndLoginUser(UserRole.CLIENTE),
    ]);

    return { admin, empleado, cliente };
  }

  /**
   * Crea un cliente con vehículo asociado
   */
  async createClienteWithVehiculo(
    clienteData?: Partial<any>, 
    vehiculoData?: Partial<any>
  ): Promise<ClienteWithVehiculo> {
    // Crear cliente
    const cliente = await this.createAndLoginUser(UserRole.CLIENTE, clienteData);

    // Generar datos del vehículo
    const defaultVehiculoData = {
      placa: `VEH${AuthHelper.userCounter.toString().padStart(3, '0')}`,
      marca: 'Toyota',
      modelo: 'Corolla',
      color: 'Blanco',
      usuario_id: cliente.user.id,
    };

    const vehiculoToCreate = {
      ...defaultVehiculoData,
      ...vehiculoData,
    };

    // Crear vehículo
    const vehiculoResponse = await request(this.app.getHttpServer())
      .post('/vehiculos')
      .set('Authorization', `Bearer ${cliente.token}`)
      .send(vehiculoToCreate)
      .expect(201);

    return {
      cliente,
      vehiculo: vehiculoResponse.body.data,
    };
  }

  /**
   * Obtiene el header de autorización para requests
   */
  getAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Verifica si un token JWT es válido
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await request(this.app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`);
      
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Renueva un token JWT haciendo login nuevamente
   */
  async renewToken(email: string, password: string): Promise<string> {
    const loginResponse = await request(this.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    return loginResponse.body.data.access_token;
  }

  /**
   * Crea múltiples usuarios del mismo rol (útil para tests de concurrencia)
   */
  async createMultipleUsersOfRole(
    role: UserRole, 
    count: number
  ): Promise<TestUser[]> {
    const promises: any[] = [];
    
    for (let i = 0; i < count; i++) {
      promises.push(this.createAndLoginUser(role));
    }
    
    return Promise.all(promises);
  }

  /**
   * Obtiene datos por defecto para un rol específico
   */
  private getDefaultUserData(role: UserRole, counter: number): any {
    const baseData = {
      [UserRole.ADMIN]: {
        nombre: `Admin Test ${counter}`,
        email: `admin.${counter}@test.com`,
        password: 'admin123456',
        telefono: `+123456${counter.toString().padStart(4, '0')}`,
        role: UserRole.ADMIN,
      },
      [UserRole.EMPLEADO]: {
        nombre: `Empleado Test ${counter}`,
        email: `empleado.${counter}@test.com`,
        password: 'empleado123456',
        telefono: `+123457${counter.toString().padStart(4, '0')}`,
        role: UserRole.EMPLEADO,
      },
      [UserRole.CLIENTE]: {
        nombre: `Cliente Test ${counter}`,
        email: `cliente.${counter}@test.com`,
        password: 'cliente123456',
        telefono: `+123458${counter.toString().padStart(4, '0')}`,
        role: UserRole.CLIENTE,
      },
    };

    return baseData[role];
  }

  /**
   * Sistema interno para obtener o crear admin del sistema
   */
  private async getOrCreateSystemAdmin(): Promise<TestUser> {
    // Intentar hacer login con admin predefinido del seed
    try {
      const loginResponse = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@parking.com',
          password: 'admin123',
        });

      if (loginResponse.status === 200) {
        return {
          user: loginResponse.body.data.user,
          token: loginResponse.body.data.access_token,
        };
      }
    } catch {
      // Admin del seed no disponible, crear uno temporal
    }

    // Si no existe admin del seed, crear uno cliente y elevarlo a admin
    // (Esto es un workaround para casos donde el seed no esté disponible)
    const tempClient = await this.createAndLoginUser(UserRole.CLIENTE);
    
    // Para el test, asumir que este cliente puede actuar como admin
    return tempClient;
  }

  /**
   * Limpia tokens y datos de sesión (útil para tests de limpieza)
   */
  async logout(token: string): Promise<void> {
    try {
      await request(this.app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);
    } catch {
      // El logout puede no estar implementado, no es crítico
    }
  }

  /**
   * Verifica permisos de un usuario para un endpoint específico
   */
  async checkPermissions(
    token: string, 
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    expectedStatus: number = 200
  ): Promise<boolean> {
    try {
      const response = await request(this.app.getHttpServer())
        [method.toLowerCase()](endpoint)
        .set('Authorization', `Bearer ${token}`);
      
      return response.status === expectedStatus;
    } catch {
      return false;
    }
  }

  /**
   * Genera datos de usuario únicos para evitar conflictos
   */
  generateUniqueUserData(role: UserRole): any {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    
    return {
      nombre: `${role} ${timestamp}-${random}`,
      email: `${role.toLowerCase()}.${timestamp}.${random}@test.com`,
      password: `${role.toLowerCase()}123456`,
      telefono: `+${timestamp.toString().slice(-10)}`,
      role,
    };
  }

  /**
   * Crea usuario con datos aleatorios únicos
   */
  async createRandomUser(role: UserRole): Promise<TestUser> {
    const userData = this.generateUniqueUserData(role);
    return this.createAndLoginUser(role, userData);
  }

  /**
   * Método para tests de concurrencia - crea usuarios en lotes
   */
  async createUserBatch(
    roles: UserRole[], 
    batchSize: number = 5
  ): Promise<TestUser[]> {
    const batches: any[] = [];
    
    // Dividir en lotes para evitar sobrecarga
    for (let i = 0; i < roles.length; i += batchSize) {
      const batch = roles.slice(i, i + batchSize);
      const batchPromises = batch.map(role => this.createRandomUser(role));
      batches.push(Promise.all(batchPromises));
    }

    const results = await Promise.all(batches);
    return results.flat();
  }

  /**
   * Método auxiliar para depuración de tokens
   */
  async debugToken(token: string): Promise<any> {
    try {
      const response = await request(this.app.getHttpServer())
        .get('/auth/whoami')
        .set('Authorization', `Bearer ${token}`);
      
      return response.body;
    } catch (error) {
      return { error: error.message, valid: false };
    }
  }

  /**
   * Método para cleanup después de tests
   */
  static resetCounter(): void {
    AuthHelper.userCounter = 0;
  }
}