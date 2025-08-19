import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../entities/user.entity';
import { UpdateUserDto } from '../dto/update-user.dto';
import { LoggingService } from '../../logging/logging.service';

/**
 * Servicio especializado de gestión de usuarios por administradores
 * Incluye reglas de negocio para cambios sensibles y logging de auditoría
 */
@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly loggingService: LoggingService,
  ) {}

  async updateUserByAdmin(
    userId: string, 
    updateData: UpdateUserDto, 
    adminUser: any
  ): Promise<Partial<User>> {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo los administradores pueden realizar esta operación');
    }

    const targetUser = await this.userRepository.findOne({ where: { id: userId } });
    if (!targetUser) {
      throw new BadRequestException('Usuario no encontrado');
    }
    
    const estadoAnterior = {
      nombre: targetUser.nombre,
      email: targetUser.email,
      telefono: targetUser.telefono,
      role: targetUser.role,
    };

    if (updateData.role && updateData.role !== targetUser.role) {
      await this.validateRoleChange(targetUser, updateData.role, adminUser);
    }

    if (updateData.email && updateData.email !== targetUser.email) {
      await this.validateEmailChange(updateData.email);
    }

    Object.assign(targetUser, updateData);
    const updatedUser = await this.userRepository.save(targetUser);

    await this.loggingService.logUserUpdated(
      adminUser.userId,
      userId,
      estadoAnterior,
      updateData,
      'Admin update operation'
    );

    this.logger.log(`Usuario actualizado por admin ${adminUser.userId} (cambios: ${JSON.stringify(updateData)})`);
    
    const { password, ...result } = updatedUser;
    return result;
  }

  private async validateRoleChange(
    user: User, 
    newRole: UserRole, 
    adminUser: any
  ): Promise<void> {
    if (user.id === adminUser.userId && newRole !== UserRole.ADMIN) {
      throw new BadRequestException('No puedes cambiar tu propio rol de administrador');
    }

    if (user.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
      const adminCount = await this.userRepository.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException('No se puede eliminar el último administrador del sistema');
      }
    }

    await this.loggingService.logRoleChange(
      adminUser.userId,
      user.id,
      user.role,
      newRole
    );
  }

  private async validateEmailChange(newEmail: string): Promise<void> {
    const existingUser = await this.userRepository.findOne({ where: { email: newEmail } });
    if (existingUser) {
      throw new BadRequestException('El email ya está registrado por otro usuario');
    }
  }

  async getUserActivity(
    userId: string, 
    days: number = 30
  ): Promise<any> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      relations: ['reservas', 'vehiculos']
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - days);

    const reservasRecientes = user.reservas.filter(
      reserva => reserva.created_at >= fechaLimite
    );

    return {
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        role: user.role,
      },
      estadisticas: {
        total_vehiculos: user.vehiculos.length,
        reservas_periodo: reservasRecientes.length,
        ultima_actividad: user.updated_at,
      },
      reservas_recientes: reservasRecientes,
    };
  }
}
