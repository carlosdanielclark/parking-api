import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { authConstants } from '../auth/constants';

/**
 * Servicio para crear datos de prueba y usuarios administrativos
 * Se ejecuta automáticamente al iniciar la aplicación
 * Garantiza que siempre exista un usuario administrador por defecto
 */
@Injectable()
export class SeedAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedAdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Hook ejecutado cuando la aplicación se inicia
   * Crea automáticamente usuarios de prueba necesarios
   */
  async onApplicationBootstrap() {
    await this.createAdminUser();
    await this.createTestUsers();
  }

  /**
   * Crea usuario administrador por defecto
   * Se ejecuta solo si no existe un admin con el email especificado
   * Credenciales: admin@parking.com / admin123
   */
  async createAdminUser() {
    const adminEmail = 'admin@parking.com';
    
    try {
      const adminExists = await this.userRepository.findOne({ 
        where: { email: adminEmail } 
      });

      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', authConstants.saltRounds);
        
        const admin = this.userRepository.create({
          nombre: 'Administrador del Sistema',
          email: adminEmail,
          password: hashedPassword,
          telefono: '+1234567890',
          role: UserRole.ADMIN,
        });

        await this.userRepository.save(admin);
        
        this.logger.log(
          `✅ Usuario administrador creado exitosamente:\n` +
          `   📧 Email: ${adminEmail}\n` +
          `   🔑 Password: admin123\n` +
          `   👤 Rol: ${UserRole.ADMIN}`
        );
      } else {
        this.logger.log(`ℹ️ Usuario administrador ya existe: ${adminEmail}`);
      }
    } catch (error) {
      this.logger.error(`❌ Error al crear usuario administrador: ${error.message}`, error.stack);
    }
  }

  /**
   * Crea usuarios de prueba para diferentes roles
   * Útil para testing y demostración del sistema
   */
  async createTestUsers() {
    const testUsers = [
      {
        nombre: 'Juan Empleado',
        email: 'empleado@parking.com',
        password: 'empleado123',
        telefono: '+1234567891',
        role: UserRole.EMPLEADO,
      },
      {
        nombre: 'María Cliente',
        email: 'cliente@parking.com', 
        password: 'cliente123',
        telefono: '+1234567892',
        role: UserRole.CLIENTE,
      },
    ];

    for (const userData of testUsers) {
      try {
        const existingUser = await this.userRepository.findOne({
          where: { email: userData.email }
        });

        if (!existingUser) {
          const hashedPassword = await bcrypt.hash(userData.password, authConstants.saltRounds);
          
          const testUser = this.userRepository.create({
            ...userData,
            password: hashedPassword,
          });

          await this.userRepository.save(testUser);
          
          this.logger.log(
            `✅ Usuario de prueba creado:\n` +
            `   📧 Email: ${userData.email}\n` +
            `   🔑 Password: ${userData.password}\n` +
            `   👤 Rol: ${userData.role}`
          );
        } else {
          this.logger.debug(`ℹ️ Usuario de prueba ya existe: ${userData.email}`);
        }
      } catch (error) {
        this.logger.error(
          `❌ Error al crear usuario de prueba ${userData.email}: ${error.message}`,
          error.stack
        );
      }
    }

    // Mostrar resumen de usuarios creados
    await this.showUsersSummary();
  }

  /**
   * Muestra resumen de usuarios en el sistema para debugging
   * Útil para verificar que los usuarios se crearon correctamente
   */
  private async showUsersSummary() {
    try {
      const userCount = await this.userRepository.count();
      const adminCount = await this.userRepository.count({ where: { role: UserRole.ADMIN } });
      const employeeCount = await this.userRepository.count({ where: { role: UserRole.EMPLEADO } });
      const clientCount = await this.userRepository.count({ where: { role: UserRole.CLIENTE } });

      this.logger.log(
        `📊 Resumen de usuarios en el sistema:\n` +
        `   👥 Total: ${userCount}\n` +
        `   👑 Administradores: ${adminCount}\n` +
        `   👨‍💼 Empleados: ${employeeCount}\n` +
        `   👤 Clientes: ${clientCount}`
      );
    } catch (error) {
      this.logger.error(`Error al obtener resumen de usuarios: ${error.message}`, error.stack);
    }
  }
}