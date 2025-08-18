import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../entities/user.entity';
import { RegisterDto } from './dto/register-dto';
import { LoginDto } from './dto/login-dto';
import { authConstants } from './constants';

/**
 * Servicio principal de autenticación y autorización
 * Maneja registro, login y validación de usuarios con JWT
 * Integra hashing de contraseñas y generación de tokens
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Registra un nuevo usuario en el sistema
   * Valida unicidad del email y hashea la contraseña
   * @param registerDto - Datos del usuario a registrar
   * @returns Usuario creado (sin contraseña) y token JWT
   */
  async register(registerDto: RegisterDto): Promise<{ user: Partial<User>; access_token: string }> {
    const { email, password, nombre, telefono, role } = registerDto;

    this.logger.log(`Intento de registro para email: ${email}`);

    // Verificar si el usuario ya existe
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Intento de registro con email duplicado: ${email}`);
      throw new ConflictException('El email ya está registrado en el sistema');
    }

    try {
      // Hashear la contraseña con bcrypt
      const hashedPassword = await bcrypt.hash(password, authConstants.saltRounds);

      // Crear nuevo usuario
      const newUser = this.userRepository.create({
        email,
        password: hashedPassword,
        nombre,
        telefono,
        role: role || UserRole.CLIENTE,
      });

      const savedUser = await this.userRepository.save(newUser);
      
      this.logger.log(`Usuario registrado exitosamente: ${savedUser.id} - ${savedUser.email}`);

      // Generar token JWT
      const payload = { 
        sub: savedUser.id, 
        email: savedUser.email, 
        role: savedUser.role 
      };
      const access_token = await this.jwtService.signAsync(payload);

      // Remover contraseña del resultado por seguridad
      const { password: _, ...userResult } = savedUser;

      return {
        user: userResult,
        access_token,
      };
    } catch (error) {
      this.logger.error(`Error al registrar usuario: ${error.message}`, error.stack);
      throw new Error('Error interno al registrar usuario');
    }
  }

  /**
   * Autentica un usuario existente
   * Verifica credenciales y genera token JWT
   * @param loginDto - Credenciales de login
   * @returns Usuario autenticado (sin contraseña) y token JWT
   */
  async login(loginDto: LoginDto): Promise<{ user: Partial<User>; access_token: string }> {
    const { email, password } = loginDto;

    this.logger.log(`Intento de login para email: ${email}`);

    // Buscar usuario por email
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      this.logger.warn(`Intento de login con email no registrado: ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Intento de login con contraseña incorrecta para: ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.logger.log(`Login exitoso para usuario: ${user.id} - ${user.email}`);

    // Generar token JWT
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role 
    };
    const access_token = await this.jwtService.signAsync(payload);

    // Remover contraseña del resultado
    const { password: _, ...userResult } = user;

    return {
      user: userResult,
      access_token,
    };
  }

  /**
   * Valida un usuario por su ID
   * Utilizado por JWT Strategy para verificar tokens
   * @param userId - ID del usuario a validar
   * @returns Usuario encontrado o null si no existe
   */
  async validateUser(userId: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      
      if (user) {
        this.logger.debug(`Usuario validado: ${user.id} - ${user.email}`);
      } else {
        this.logger.warn(`Intento de validación con ID inexistente: ${userId}`);
      }
      
      return user;
    } catch (error) {
      this.logger.error(`Error al validar usuario ${userId}: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Verifica si un usuario tiene un rol específico
   * Utilizado para autorización granular
   * @param userId - ID del usuario
   * @param requiredRole - Rol requerido
   * @returns true si el usuario tiene el rol requerido
   */
  async hasRole(userId: string, requiredRole: UserRole): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({ 
        where: { id: userId },
        select: ['id', 'role']
      });
      
      return user?.role === requiredRole || false;
    } catch (error) {
      this.logger.error(`Error al verificar rol para usuario ${userId}: ${error.message}`, error.stack);
      return false;
    }
  }
}