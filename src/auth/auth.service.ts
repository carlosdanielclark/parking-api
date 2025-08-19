import { Injectable, UnauthorizedException, ConflictException, Logger, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../entities/user.entity';
import { RegisterDto } from './dto/register-dto';
import { LoginDto } from './dto/login-dto';
import { authConstants } from './constants';
import { LoggingService } from 'src/logging/logging.service';

/**
 * Servicio de autenticación y registro de usuarios
 * Maneja JWT, encriptación de contraseñas y validación de credenciales
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly loggingService: LoggingService,
  ) {}

  /**
   * Registrar nuevo usuario
   * Por defecto asigna rol CLIENTE, los admin se crean desde seeds
   */
  async register(registerDto: RegisterDto): Promise<{ user: Partial<User>, access_token: string }> {
    const { email, password, ...userData } = registerDto;

    this.logger.log(`Registro de usuario: ${email}`);

    // Verificar si el email ya existe
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Intento de registro con email duplicado: ${email}`);
      throw new BadRequestException('El email ya está registrado');
    }

    try {
      // Encriptar contraseña
      const hashedPassword = await bcrypt.hash(password, authConstants.saltRounds);

      // Crear usuario (por defecto CLIENTE, admin solo via registerDto.role)
      const newUser = this.userRepository.create({
        ...userData,
        email,
        password: hashedPassword,
        role: registerDto.role || UserRole.CLIENTE,
      });

      const savedUser = await this.userRepository.save(newUser);

      // Generar token JWT
      const payload = { 
        sub: savedUser.id, 
        email: savedUser.email, 
        role: savedUser.role 
      };
      const access_token = this.jwtService.sign(payload);

      this.logger.log(`Usuario registrado exitosamente: ${savedUser.email} (${savedUser.role})`);

      // Remover contraseña de la respuesta
      const { password: _, ...userResult } = savedUser;

      return {
        user: userResult,
        access_token,
      };
    } catch (error) {
      this.logger.error(`Error al registrar usuario: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno al registrar usuario');
    }
  }

  /**
   * Autenticar usuario existente
   */
  async login(loginDto: LoginDto): Promise<{ user: Partial<User>, access_token: string }> {
    const { email, password } = loginDto;

    this.logger.log(`Intento de login: ${email}`);

    try {
      // Buscar usuario por email
      const user = await this.userRepository.findOne({ where: { email } });
      if (!user) {
        this.logger.warn(`Login fallido - usuario no encontrado: ${email}`);
        throw new UnauthorizedException('Credenciales inválidas');
      }

      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        this.logger.warn(`Login fallido - contraseña incorrecta: ${email}`);
        throw new UnauthorizedException('Credenciales inválidas');
      }

      // Generar token JWT
      const payload = { 
        sub: user.id, 
        email: user.email, 
        role: user.role 
      };
      const access_token = this.jwtService.sign(payload);

      this.logger.log(`Login exitoso: ${user.email} (${user.role})`);

      // Logging de auditoría
      try {
        await this.loggingService.logUserLogin(user.id, user.email);
      } catch (logError) {
        this.logger.warn(`Error al registrar log de login: ${logError.message}`);
      }

      // Remover contraseña de la respuesta
      const { password: _, ...userResult } = user;

      return {
        user: userResult,
        access_token,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Error en login: ${error.message}`, error.stack);
      throw new BadRequestException('Error interno en autenticación');
    }
  }

  /**
   * Validar usuario por ID (usado por JWT Strategy)
   */
  async validateUserById(userId: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      return user || null;
    } catch (error) {
      this.logger.error(`Error al validar usuario ${userId}: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Buscar usuario por email (método auxiliar)
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({ where: { email } });
    } catch (error) {
      this.logger.error(`Error al buscar usuario por email ${email}: ${error.message}`, error.stack);
      return null;
    }
  }
}
