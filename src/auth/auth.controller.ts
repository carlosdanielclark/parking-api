import { Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register-dto';
import { LoginDto } from './dto/login-dto';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import * as getUserDecorator from './decorators/get-user.decorator';

/**
 * Controlador de autenticación y autorización
 * Maneja endpoints públicos (registro, login) y protegidos (perfil)
 * Implementa las funcionalidades básicas de autenticación JWT
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Endpoint público para registro de nuevos usuarios
   * Permite crear cuentas sin autenticación previa
   * Por defecto asigna rol CLIENTE, solo ADMIN puede crear otros roles
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    this.logger.log(`Solicitud de registro para email: ${registerDto.email}`);
    
    try {
      const result = await this.authService.register(registerDto);
      
      this.logger.log(`Registro exitoso para usuario: ${result.user.email}`);
      
      return {
        message: 'Usuario registrado exitosamente',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error en registro: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Endpoint público para inicio de sesión
   * Valida credenciales y retorna JWT token
   * Compatible con todos los tipos de usuarios (admin, empleado, cliente)
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`Solicitud de login para email: ${loginDto.email}`);
    
    try {
      const result = await this.authService.login(loginDto);
      
      this.logger.log(`Login exitoso para usuario: ${result.user.email} (${result.user.role})`);
      
      return {
        message: 'Login exitoso',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error en login: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Endpoint protegido para obtener información del perfil
   * Requiere autenticación JWT válida
   * Retorna información del usuario actualmente autenticado
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  getProfile(@getUserDecorator.GetUser() user: getUserDecorator.AuthenticatedUser) {
    this.logger.log(`Consulta de perfil para usuario: ${user.userId} - ${user.email}`);
    
    return {
      message: 'Información del perfil obtenida exitosamente',
      data: {
        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
        },
      },
    };
  }

  /**
   * Endpoint de prueba para verificar protección JWT
   * Útil para testing y debugging de autenticación
   * Accesible solo con token JWT válido
   */
  @UseGuards(JwtAuthGuard)
  @Get('test-protected')
  @HttpCode(HttpStatus.OK)
  testProtectedRoute(@getUserDecorator.GetUser() user: getUserDecorator.AuthenticatedUser) {
    this.logger.log(`Acceso a ruta de prueba para usuario: ${user.userId}`);
    
    return {
      message: 'Acceso exitoso a ruta protegida',
      data: {
        user: user,
        timestamp: new Date().toISOString(),
        endpoint: '/auth/test-protected',
      },
    };
  }

  /**
   * Endpoint para verificar rol de usuario actual
   * Útil para debugging de autorización por roles
   * Retorna información detallada del usuario autenticado
   */
  @UseGuards(JwtAuthGuard)
  @Get('whoami')
  @HttpCode(HttpStatus.OK)
  whoAmI(
    @getUserDecorator.GetUser() user: getUserDecorator.AuthenticatedUser,
    @getUserDecorator.GetUser('userId') userId: string,
    @getUserDecorator.GetUser('email') email: string,
    @getUserDecorator.GetUser('role') role: string,
  ) {
    this.logger.log(`Consulta de identidad para usuario: ${userId}`);
    
    return {
      message: 'Información de identidad obtenida',
      data: {
        fullUser: user,
        individual: {
          userId,
          email,
          role,
        },
      },
    };
  }
}