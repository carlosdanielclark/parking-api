// test/helpers/auth-helper.ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { UserRole } from '../../src/entities/user.entity';

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
  constructor(private app: INestApplication) {}

    /**
   * Crear un cliente con un vehículo asociado
   * Útil para tests que requieren un cliente con vehículo
   * 
   * @returns Objeto con el cliente autenticado y el vehículo creado
   */
  async createClienteWithVehiculo(): Promise<{
    cliente: AuthenticatedUser;
    vehiculo: any;
  }> {
    // Crear cliente
    const cliente = await this.createAndLoginUser(UserRole.CLIENTE);
    
    // Crear vehículo para el cliente
    const vehiculoData = {
      placa: `TEST-${Date.now()}`,
      marca: 'Test',
      modelo: 'Model',
      color: 'Color'
    };

    const response = await request(this.app.getHttpServer())
      .post('/vehiculos')
      .set(this.getAuthHeader(cliente.token))
      .send(vehiculoData)
      .expect(201);

    return {
      cliente,
      vehiculo: response.body.data
    };
  }


  /**
   * Crear y hacer login de un usuario de prueba
   * 
   * @param role - Rol del usuario a crear
   * @param customData - Datos personalizados opcionales
   * @returns Usuario autenticado con token
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

    // Si no es cliente, necesitamos actualizar el rol (solo admin puede hacerlo)
    let userResponse = registerResponse;
    if (role !== UserRole.CLIENTE) {
      // Usar admin predeterminado para cambiar rol
      const adminToken = await this.getAdminToken();
      
      await request(this.app.getHttpServer())
        .patch(`/users/${registerResponse.body.data.user.id}`)
        .set(this.getAuthHeader(adminToken))
        .send({ role })
        .expect(200);

      // Hacer login nuevamente para obtener token actualizado
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
   * Útil para tests que requieren interacciones entre roles
   * 
   * @returns Objeto con usuarios de cada rol
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
        nombre: 'Admin Test'
      }),
      this.createAndLoginUser(UserRole.EMPLEADO, {
        email: `empleado-${timestamp}@test.com`,
        nombre: 'Empleado Test'
      }),
      this.createAndLoginUser(UserRole.CLIENTE, {
        email: `cliente-${timestamp}@test.com`,
        nombre: 'Cliente Test'
      }),
    ]);

    return { admin, empleado, cliente };
  }

  /**
   * Obtener token del administrador predeterminado del sistema
   * 
   * @returns Token JWT del admin
   */
  // Mejorar getAdminToken con máximo de reintentos
/**
 * Obtener token del administrador predeterminado del sistema
 * Mejorado con reintentos y mejor manejo de errores
 */
async getAdminToken(maxRetries = 3): Promise<string> {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      const response = await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@parking.com',
          password: 'admin123',
        })
        .timeout(10000) // Timeout de 10 segundos
        .expect(200);

      return response.body.data.access_token;
    } catch (error) {
      attempts++;
      console.warn(`⚠️ Intento ${attempts} fallido para obtener token admin:`, error.message);
      
      if (attempts >= maxRetries) {
        throw new Error(`Failed to get admin token after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Esperar antes del siguiente intento
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
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
   * 
   * @returns Token JWT del empleado
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
    } catch (error) {
      throw new Error(`No se pudo obtener token de empleado: ${error.message}`);
    }
  }

  /**
   * Obtener token del cliente predeterminado del sistema
   * 
   * @returns Token JWT del cliente
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
    } catch (error) {
      throw new Error(`No se pudo obtener token de cliente: ${error.message}`);
    }
  }

  /**
   * Generar headers de autorización para requests
   * 
   * @param token - Token JWT
   * @returns Headers de autorización
   */
  getAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }


  /**
   * Hacer login con credenciales específicas
   * 
   * @param email - Email del usuario
   * @param password - Contraseña del usuario
   * @returns Token JWT
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
   * 
   * @param token - Token a verificar
   * @returns true si el token es válido
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
   * 
   * @param token - Token JWT
   * @returns Información del usuario
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
   * Elimina usuarios creados durante los tests
   * 
   * @param adminToken - Token de administrador
   * @param userIds - IDs de usuarios a eliminar
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
}