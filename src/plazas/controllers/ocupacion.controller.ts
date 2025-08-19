import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OcupacionService } from '../services/ocupacion.service.js';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { TipoPlaza } from '../../entities/plaza.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

@Controller('ocupacion')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OcupacionController {
  constructor(private readonly ocupacionService: OcupacionService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  async getOcupacionCompleta() {
    return this.ocupacionService.getOcupacionCompleta();
  }

  @Get('disponibles')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO, UserRole.CLIENTE)
  async getPlazasDisponibles(@Query('tipo') tipo?: TipoPlaza) {
    return this.ocupacionService.getPlazasDisponibles(tipo);
  }

  @Get('historial')
  @Roles(UserRole.ADMIN, UserRole.EMPLEADO)
  async getHistorialOcupacion(@Query('dias') dias?: number) {
    return this.ocupacionService.getHistorialOcupacion(dias || 7);
  }
}
