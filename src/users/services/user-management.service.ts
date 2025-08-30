import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../entities/user.entity';
import { UpdateUserDto } from '../dto/update-user.dto';
import { LoggingService } from '../../logging/logging.service';

@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly loggingService: LoggingService,
  ) {}

  async updateUserByAdmin(id: string, updateDto: UpdateUserDto, adminUser: any): Promise<Partial<User>> {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can perform this operation');
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const previousState = { nombre: user.nombre, email: user.email, telefono: user.telefono, role: user.role };

    if (updateDto.role && updateDto.role !== user.role) {
      await this.validateRoleChange(user, updateDto.role, adminUser);
    }

    if (updateDto.email && updateDto.email !== user.email) {
      await this.validateEmail(updateDto.email);
    }

    Object.assign(user, updateDto);
    const updated = await this.userRepository.save(user);

    // Log role change if occurred
    if (updateDto.role && updateDto.role !== previousState.role) {
      this.logger.log(`Role changed for user ${id}: ${previousState.role} -> ${updateDto.role}`);
      await this.loggingService.logRoleChange(
        adminUser.userId,
        id,
        previousState.role,
        updateDto.role,
      );
    }

    // Log user update audit
    await this.loggingService.logUserUpdated(
      adminUser.userId,
      id,
      previousState,
      updateDto,
      'Admin update',
    );

    this.logger.log(`User updated by admin: ${id} changes: ${JSON.stringify(updateDto)}`);

    const { password: _, ...result } = updated;
    return result;
  }

  private async validateRoleChange(user: User, newRole: UserRole, adminUser: any): Promise<void> {
    if (user.id === adminUser.userId && newRole !== UserRole.ADMIN) {
      throw new BadRequestException('Cannot remove your own admin role');
    }

    if (user.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
      const count = await this.userRepository.count({ where: { role: UserRole.ADMIN } });
      if (count <= 1) throw new BadRequestException('Cannot remove last admin');
    }
  }

  private async validateEmail(email: string): Promise<void> {
    const exists = await this.userRepository.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Email already registered');
  }
}
