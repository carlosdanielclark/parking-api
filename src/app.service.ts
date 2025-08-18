import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Servicio principal de la aplicación
 * Demuestra el uso del ConfigService para acceder a la configuración
 */
@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  /**
   * Método que demuestra el acceso a variables de configuración
   * @returns Mensaje con información de la configuración actual
   */
  getHello(): string {
    const port = this.configService.get<number>('port');
    const nodeEnv = this.configService.get<string>('nodeEnv');
    const dbHost = this.configService.get<string>('database.postgres.host');
    
    return `Parking API funcionando en puerto ${port}, entorno: ${nodeEnv}, DB host: ${dbHost}`;
  }
}
