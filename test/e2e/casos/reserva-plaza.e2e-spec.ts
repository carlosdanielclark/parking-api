// test/e2e/casos/reserva-plaza.e2e-spec.ts
import request, { Response } from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper, AuthenticatedUser } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { EstadoPlaza, TipoPlaza } from '../../../src/entities/plaza.entity';
import { EstadoReservaDTO } from '../../../src/entities/reserva.entity';
import { logStepV3 } from '../../helpers/log-util';
import { UserRole } from '../../../src/entities/user.entity';

jest.setTimeout(60000); // Aumentar timeout global
/**
 * Tests E2E para Caso de Uso 1: Reservar Plaza de Aparcamiento
 * 
 * Cubre el flujo completo donde un cliente desea reservar una plaza de aparcamiento
 * para un vehículo en particular, verificando disponibilidad y creando la reserva.
 */
describe('Caso de Uso 1: Reservar Plaza de Aparcamiento (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let usuarios: {
    admin: AuthenticatedUser;
    empleado: AuthenticatedUser;
    cliente: AuthenticatedUser;
  };
  let plazas: any[];
  let vehiculo: any;
  let reservas: any[] = []; // Array para trackear reservas creadas

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();

    authHelper = new AuthHelper(app);
    dataFixtures = new DataFixtures(app);
  });

  beforeEach(async () => {
    // ✅ LIMPIEZA MÁS AGRESIVA al inicio
    DataFixtures.clearGeneratedPlazaNumbers();
    
    // ✅ DOBLE VERIFICACIÓN: limpiar nuevamente después de un delay
    await new Promise(resolve => setTimeout(resolve, 100));
    DataFixtures.clearGeneratedPlazaNumbers();

    // Resetear array de reservas
    reservas = [];
    
    logStepV3('🔄 Estado inicial limpiado, iniciando setup', {
      etiqueta: "SETUP",
      tipo: "info"
    });
    
    // Crear usuarios de prueba
    usuarios = await authHelper.createMultipleUsers();
    
    // Crear plazas disponibles con reintentos mejorados
    let intentosPlazas = 0;
    const maxIntentosPlazas = 5; // ✅ AUMENTADO
    
    while (intentosPlazas < maxIntentosPlazas) {
      try {
        plazas = await dataFixtures.createPlazas(usuarios.admin.token, {
          count: 5,
          estado: EstadoPlaza.LIBRE
        });
        break;
      } catch (error: any) {
        intentosPlazas++;
        logStepV3(`Intento ${intentosPlazas}/${maxIntentosPlazas} fallido creando plazas:`, {
          etiqueta: "SETUP_PLAZAS",
          tipo: "warning"
        }, error.message);
        
        if (intentosPlazas >= maxIntentosPlazas) {
          throw new Error(`No se pudieron crear plazas después de ${maxIntentosPlazas} intentos`);
        }
        
        // ✅ LIMPIEZA MÁS AGRESIVA entre reintentos
        DataFixtures.clearGeneratedPlazaNumbers();
        await new Promise(resolve => setTimeout(resolve, 3000)); // ✅ AUMENTADO
      }
    }
    
    // ✅ CREAR VEHÍCULO CON PREFIJO MÁS CORTO
    let vehiculoCreado = false;
    let intentosVehiculo = 0;
    const maxIntentosVehiculo = 5;
    
    while (!vehiculoCreado && intentosVehiculo < maxIntentosVehiculo) {
      try {
        // ✅ PREFIJO MÁS CORTO: 'BC' en lugar de 'BCH'
        const placaUnica = dataFixtures.generateUniquePlaca('BC');
        
        logStepV3(`🚗 Intento ${intentosVehiculo + 1}: Creando vehículo con placa ${placaUnica}`, {
          etiqueta: "SETUP_VEHICULO",
          tipo: "info"
        });
        
        vehiculo = await dataFixtures.createVehiculo(
          usuarios.cliente.user.id, 
          usuarios.cliente.token,
          {
            placa: placaUnica,
            marca: 'Toyota',
            modelo: 'Corolla',
            color: 'Blanco'
          }
        );
        
        vehiculoCreado = true;
        logStepV3(`✅ Vehículo creado exitosamente: ${vehiculo.placa}`, {
          etiqueta: "SETUP_VEHICULO",
          tipo: "info"
        });
        
      } catch (error: any) {
        intentosVehiculo++;
        logStepV3(`❌ Intento ${intentosVehiculo} fallido creando vehículo:`, {
          etiqueta: "SETUP_VEHICULO",
          tipo: "error"
        }, error.message);
        
        if (intentosVehiculo >= maxIntentosVehiculo) {
          throw new Error(`No se pudo crear vehículo después de ${maxIntentosVehiculo} intentos`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logStepV3(`🎯 Setup completado: ${plazas.length} plazas, vehículo ${vehiculo.placa}`, {
      etiqueta: "BEFOREHEACH",
      tipo: "info"
    });
    
    // Delay final para estabilización
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  // Agregar afterEach para limpieza
  afterEach(async () => {
    // Añadir delay antes de empezar cleanup
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const adminToken = await authHelper.getAdminToken();
      
      // Usar el nuevo método de limpieza completa CORREGIDO
      await dataFixtures.cleanupComplete(adminToken);

      logStepV3('Cleanup completo ejecutado exitosamente', { 
        tipo: "info", 
        etiqueta: 'AFTEREACH_SUCCESS' 
      });

    } catch (error) {
      logStepV3(`Error en cleanup afterEach: ${error.message}`, { 
        tipo: "warning", 
        etiqueta: 'AFTEREACH' 
      });
      
      // Limpieza de emergencia MEJORADA
      try {
        logStepV3('Iniciando limpieza de emergencia', { 
          tipo: "warning", 
          etiqueta: 'EMERGENCY_START' 
        });
        
        const emergencyToken = await authHelper.getAdminToken();
        
        // Cancelar reservas de emergencia
        for (const reserva of reservas) {
          try {
            await request(app.getHttpServer())
              .post(`/reservas/${reserva.id}/cancelar`)
              .set('Authorization', `Bearer ${emergencyToken}`)
              .timeout(10000);
              
            logStepV3(`Reserva ${reserva.id} cancelada en emergencia`, { 
              tipo: "info", 
              etiqueta: 'EMERGENCY_RESERVA_SUCCESS' 
            });
          } catch (reservaError: any) {
            logStepV3(`Error cancelando reserva ${reserva.id}: ${reservaError.message}`, { 
              tipo: "warning", 
              etiqueta: 'EMERGENCY_RESERVA_FAIL' 
            });
          }
        }
        
        // Esperar antes de continuar
        logStepV3('Esperando 2 segundos antes de limpieza de vehículos', { 
          etiqueta: 'EMERGENCY_WAIT' 
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Intentar eliminar vehículo de emergencia
        if (vehiculo && vehiculo.id) {
          try {
            await request(app.getHttpServer())
              .delete(`/vehiculos/${vehiculo.id}`)
              .set('Authorization', `Bearer ${emergencyToken}`)
              .timeout(10000);
              
            logStepV3(`Vehículo ${vehiculo.id} eliminado en emergencia`, { 
              tipo: "info", 
              etiqueta: 'EMERGENCY_VEHICULO_SUCCESS' 
            });
          } catch (vehiculoError: any) {
            logStepV3(`Error eliminando vehículo ${vehiculo.id}: ${vehiculoError.message}`, { 
              tipo: "warning", 
              etiqueta: 'EMERGENCY_VEHICULO_FAIL' 
            });
          }
        } else {
          logStepV3('No hay vehículo para limpiar en emergencia', { 
            etiqueta: 'EMERGENCY_NO_VEHICULO' 
          });
        }
        
        // Intentar eliminar plazas de emergencia
        if (plazas && plazas.length > 0) {
          for (const plaza of plazas) {
            try {
              await request(app.getHttpServer())
                .delete(`/plazas/${plaza.id}`)
                .set('Authorization', `Bearer ${emergencyToken}`)
                .timeout(10000);
                
              logStepV3(`Plaza ${plaza.id} eliminada en emergencia`, { 
                tipo: "info", 
                etiqueta: 'EMERGENCY_PLAZA_SUCCESS' 
              });
            } catch (plazaError: any) {
              logStepV3(`Error eliminando plaza ${plaza.id}: ${plazaError.message}`, { 
                tipo: "warning", 
                etiqueta: 'EMERGENCY_PLAZA_FAIL' 
              });
            }
          }
        }
        
        logStepV3('Limpieza de emergencia completada', { 
          tipo: "info", 
          etiqueta: 'EMERGENCY_COMPLETE' 
        });
        
      } catch (emergencyError: any) {
        logStepV3(`Error crítico en cleanup de emergencia: ${emergencyError.message}`, { 
          tipo: "error", 
          etiqueta: 'EMERGENCY_CRITICAL_FAIL' 
        });
      }
    } finally {
      // Limpiar arrays SIEMPRE
      const reservasCount = reservas.length;
      reservas.length = 0;
      
      logStepV3(`Arrays limpiados: ${reservasCount} reservas removidas`, { 
        tipo: "info", 
        etiqueta: 'CLEANUP_ARRAYS' 
      });
    }
  });


  describe('Flujo exitoso de reserva', () => {
    it('debe permitir a un cliente reservar una plaza disponible', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      logStepV3(`Creando reserva: Plaza ${plazas[0].numero_plaza} para ${vehiculo.placa}`, { etiqueta: 'RESERVA' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      // Guardar reserva para limpieza
      reservas.push(response.body.data);

      // Verificar estructura de respuesta
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        estado: EstadoReservaDTO.ACTIVA,
        fecha_inicio: expect.any(String),
        fecha_fin: expect.any(String),
      });

      // Verificar que incluye relaciones
      expect(response.body.data.usuario).toMatchObject({
        id: usuarios.cliente.user.id,
        nombre: usuarios.cliente.user.nombre,
        email: usuarios.cliente.user.email,
      });

      expect(response.body.data.plaza).toMatchObject({
        id: plazas[0].id,
        numero_plaza: plazas[0].numero_plaza,
        estado: EstadoPlaza.OCUPADA, // Plaza debe cambiar a ocupada
      });

      expect(response.body.data.vehiculo).toMatchObject({
        id: vehiculo.id,
        placa: vehiculo.placa,
        marca: vehiculo.marca,
      });

      logStepV3(`Reserva creada exitosamente:`, { etiqueta: 'RESERVA' }, response.body.data.id);
    });

    it('debe actualizar el estado de la plaza a OCUPADA tras crear reserva', async () => {
      // Verificar que la plaza está libre inicialmente
      logStepV3(`Verificando estado inicial de la plaza...`, { etiqueta: 'PLAZA' });
      let plazaResponse = await request(app.getHttpServer())
        .get(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .timeout(10000) // Timeout aumentado
        .expect(200);

      logStepV3(`Estado inicial plaza: ${plazaResponse.body.data.estado}`, { etiqueta: 'PLAZA' });
      expect(plazaResponse.body.data.estado).toBe(EstadoPlaza.LIBRE);

      // Crear reserva
      logStepV3(`Creando reserva...`, { etiqueta: 'RESERVA' });
      const reservaDto = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const reservaResp = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaDto)
        .timeout(15000) // Timeout aumentado
        .expect(201);

      logStepV3(`Reserva creada con ID: ${reservaResp.body.data.id}`, { etiqueta: 'RESERVA' });
      
      // Guardar reserva para limpieza
      reservas.push(reservaResp.body.data);

      // Polling mejorado para verificar cambio de estado
      let intentos = 0;
      let estadoActual = EstadoPlaza.LIBRE;
      const MAX_INTENTOS = 30; // Aumentado
      const DELAY_MS = 500;
      let plazaStatusResp: Response;

      logStepV3(`Iniciando polling para verificar cambio de estado...`, { etiqueta: 'POLLING' });

      while (intentos < MAX_INTENTOS) {
        try {
          logStepV3(`Intento ${intentos + 1} de ${MAX_INTENTOS}`, { etiqueta: 'POLLING' });
          
          plazaStatusResp = await request(app.getHttpServer())
            .get(`/plazas/${reservaDto.plaza_id}`)
            .set(authHelper.getAuthHeader(usuarios.empleado.token))
            .timeout(10000)
            .expect(200);

          estadoActual = plazaStatusResp.body.data.estado;
          logStepV3(`Estado actual de la plaza: ${estadoActual}`, { etiqueta: 'PLAZA' });

          if (estadoActual === EstadoPlaza.OCUPADA) {
            logStepV3(`¡Estado OCUPADA detectado en intento ${intentos + 1}!`, { etiqueta: 'PLAZA' });
            break;
          }

          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
          intentos++;
          
        } catch (error) {
          logStepV3(`Error en polling intento ${intentos + 1}: ${error.message}`, { etiqueta: 'POLLING', tipo: 'error' });
          
          // Si es error de conexión, esperar más tiempo
          if (error.message.includes('ECONNRESET') || error.message.includes('timeout')) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          intentos++;
        }
      }

      // Verificar el resultado final
      logStepV3(`Estado final después de polling: ${estadoActual}`, { etiqueta: 'PLAZA' });
      logStepV3(`Intentos realizados: ${intentos}/${MAX_INTENTOS}`, { etiqueta: 'TIME' });
      
      if (estadoActual !== EstadoPlaza.OCUPADA) {
        logStepV3(`⚠️ Polling no detectó el cambio a OCUPADA`, { etiqueta: 'PLAZA', tipo: 'error' });
        
        // Hacer una última verificación con más detalles
        try {
          const finalCheck = await request(app.getHttpServer())
            .get(`/plazas/${reservaDto.plaza_id}`)
            .set(authHelper.getAuthHeader(usuarios.empleado.token))
            .timeout(10000);
            
          logStepV3(`Verificación final - Estado: ${finalCheck.body.data.estado}`, { etiqueta: 'PLAZA' });
          logStepV3(`Respuesta completa:`, { etiqueta: 'PLAZA', tipo: 'warning' }, JSON.stringify(finalCheck.body, null, 2));
          
          estadoActual = finalCheck.body.data.estado;
        } catch (checkError) {
          logStepV3(`Error en verificación final: ${checkError.message}`, { etiqueta: 'PLAZA', tipo: 'error' });
        }
      }
      
      expect(estadoActual).toBe(EstadoPlaza.OCUPADA);
    });

    it('debe rechazar reservas con fecha fin anterior a fecha inicio', async () => {
      logStepV3(`Preparando reserva con fecha fin anterior a fecha inicio...`, { etiqueta: 'RESERVA' , tipo: 'info'});
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(5), // 5 horas en el futuro
        fecha_fin: dataFixtures.generateFutureDate(2),    // 2 horas en el futuro (ANTERIOR)
      };

      logStepV3(`Fecha inicio:`, { etiqueta: 'DATE' , tipo: 'info'}, reservaData.fecha_inicio);
      logStepV3(`Fecha fin:`, { etiqueta: 'DATE' , tipo: 'info'}, reservaData.fecha_fin);
      logStepV3(`Verificando que fecha fin es anterior:`, { etiqueta: 'DATE' , tipo: 'info'});
      new Date(reservaData.fecha_fin) < new Date(reservaData.fecha_inicio);

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400); // Esperamos código 400 Bad Request

      logStepV3(`Respuesta de error recibida:`, { etiqueta: 'RESERVA' , tipo: 'error'}, JSON.stringify(response.body, null, 2));
      // Verificar que el mensaje de error contenga la validación esperada
      expect(response.body.message).toContain('fecha de fin debe ser posterior');
      
      console.log('✅ Test de validación de fechas pasado correctamente');
      logStepV3(`Test de validación de fechas pasado correctamente`, { etiqueta: 'RESERVA' , tipo: 'info'});
    });
  });
 
  describe('Validaciones de negocio', () => {
    it('debe rechazar reserva de plaza ya ocupada', async () => {
      // 1. Crear primera reserva DIRECTAMENTE (sin usar helper que falla)
      const primeraReservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(3),
      };

      logStepV3(`Creando primera reserva directamente...`, { etiqueta: 'NEGOCIO' });

      const primeraReservaResp = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(primeraReservaData)
        .timeout(10000)
        .expect(201);

      // Guardar para limpieza
      reservas.push(primeraReservaResp.body.data);
      logStepV3(`Primera reserva creada exitosamente: ${primeraReservaResp.body.data.id}`, { etiqueta: 'NEGOCIO' });

      // 2. Esperar a que la plaza esté realmente ocupada
      await dataFixtures.waitForPlazaState(
        app, 
        plazas[0].id, 
        EstadoPlaza.OCUPADA, 
        authHelper, 
        usuarios, 
        20, 
        500
      );

      // 3. Intentar crear SEGUNDA reserva que debe fallar con 400
      const segundaReservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(2), // Fechas solapadas
        fecha_fin: dataFixtures.generateFutureDate(5),
      };

      logStepV3(`Intentando segunda reserva en plaza ocupada...`, { etiqueta: 'NEGOCIO' });

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(segundaReservaData)
        .timeout(10000)
        .expect(400); // Debe fallar

      logStepV3('Respuesta error esperada:', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('La plaza no está disponible');
    });

    it('debe rechazar fechas de inicio en el pasado', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generatePastDate(1),
        fecha_fin: dataFixtures.generateFutureDate(3),
      };
      logStepV3(`Intentando reservar con fecha pasada: Inicio(${reservaData.fecha_inicio}) || Fin(${reservaData.fecha_fin})`, { etiqueta: 'NEGOCIO' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      logStepV3('Respuesta error esperada', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('fecha de inicio debe ser futura');
    });

    it('debe rechazar reservas con fecha fin anterior a fecha inicio', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(5),
        fecha_fin: dataFixtures.generateFutureDate(2),
      };
      logStepV3(`Intentando reserva con fecha fin(${reservaData.fecha_fin}) anterior a inicio(${reservaData.fecha_inicio})`, { etiqueta: 'NEGOCIO' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      logStepV3('Respuesta error esperada', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('fecha de fin debe ser posterior');
    });

    it('debe rechazar reservas que excedan 24 horas', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(26),
      };
      logStepV3(`Intentando reserva mayor a 24h: inicio(${reservaData.fecha_inicio} || fin(${reservaData.fecha_fin})`, { etiqueta: 'NEGOCIO' });
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(400);

      logStepV3('Respuesta error esperada', { tipo: 'error', etiqueta: 'NEGOCIO' }, response.body.message);
      expect(response.body.message).toContain('no puede exceder 24 horas');
    });

    it('debe rechazar reserva con vehículo que no pertenece al usuario', async () => {
      logStepV3('Creando otro cliente y vehículo', { etiqueta: 'NEGOCIO' });
      
      // ✅ MEJORADO: Crear cliente con mejor manejo de errores
      let otroCliente: AuthenticatedUser | undefined = undefined;
      let intentos = 0;
      const maxIntentos = 3;
      
      while (intentos < maxIntentos) {
        try {
          otroCliente = await authHelper.createAndLoginUser(UserRole.CLIENTE);
          break;
        } catch (error: any) {
          intentos++;
          logStepV3(`Intento ${intentos}/${maxIntentos} fallido creando cliente:`, {
            etiqueta: "TEST_SETUP",
            tipo: "warning"
          }, error.message);
          
          if (intentos >= maxIntentos) {
            throw new Error(`No se pudo crear cliente después de ${maxIntentos} intentos`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      // ✅ VERIFICACIÓN: Asegurar que otroCliente fue asignada
      if (!otroCliente) {
        throw new Error('No se pudo crear cliente después de todos los intentos');
      }
      
      // Validar que el cliente fue creado correctamente
      expect(otroCliente.user.id).toBeDefined();
      expect(otroCliente.token).toBeDefined();
      expect(otroCliente.user.id).not.toBe(usuarios.cliente.user.id); // ✅ NUEVO: Verificar que es diferente
      
      // ✅ MEJORADO: Crear vehículo con placa única y validación
      let otroVehiculo: any | undefined = undefined;
      intentos = 0;
      
      while (intentos < maxIntentos) {
        try {
          const placaUnicaOtro = dataFixtures.generateUniquePlaca('OTR');
          
          // ✅ NUEVO: Validar que la placa es diferente a la del vehículo original
          if (placaUnicaOtro === vehiculo.placa) {
            throw new Error('Placa duplicada generada');
          }
          
          logStepV3(`Intento ${intentos + 1}: Creando vehículo con placa ${placaUnicaOtro}`, {
            etiqueta: "VEHICULO_SETUP",
            tipo: "info"
          });
          
          otroVehiculo = await dataFixtures.createVehiculo(
            otroCliente.user.id,
            otroCliente.token,
            {
              placa: placaUnicaOtro,
              marca: 'Mazda',
              modelo: '3',
              color: 'Negro'
            }
          );
          
          logStepV3(`✅ Vehículo creado exitosamente: ${otroVehiculo.placa}`, {
            etiqueta: "VEHICULO_SETUP",
            tipo: "info"
          });
          break;
          
        } catch (error: any) {
          intentos++;
          logStepV3(`Intento ${intentos}/${maxIntentos} fallido creando vehículo:`, {
            etiqueta: "VEHICULO_SETUP",
            tipo: "error"
          }, {
            error: error.message,
            status: error.status,
            response: error.response?.body
          });
          
          if (intentos >= maxIntentos) {
            logStepV3(`❌ FALLO CRÍTICO: No se pudo crear vehículo después de ${maxIntentos} intentos`, {
              etiqueta: "VEHICULO_SETUP",
              tipo: "error"
            });
            throw new Error(`No se pudo crear vehículo para test después de ${maxIntentos} intentos: ${error.message}`);
          }
          
          // Esperar más tiempo entre intentos
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      if (!otroVehiculo) {
        throw new Error('No se pudo crear vehículo después de todos los intentos');
      }

      // Validar que el vehículo fue creado correctamente
      expect(otroVehiculo.id).toBeDefined();
      expect(otroVehiculo.placa).toBeDefined();
      expect(otroVehiculo.usuario_id).toBe(otroCliente.user.id);

      // Asegurarse de que tenemos una plaza disponible
      if (!plazas || plazas.length === 0) {
        throw new Error('No hay plazas disponibles para el test');
      }

      // ✅ MEJORADO: Intentar crear reserva usando el vehículo del otro usuario
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,  // Usuario original
        plaza_id: plazas[0].id,
        vehiculo_id: otroVehiculo.id,  // Vehículo de otro usuario ❌
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      
      logStepV3('Intentando reservar con vehículo ajeno...', { 
        etiqueta: 'NEGOCIO' 
      }, {
        usuarioReserva: usuarios.cliente.user.id,
        usuarioVehiculo: otroVehiculo.usuario_id,
        vehiculoId: otroVehiculo.id,
        plazaId: plazas[0].id
      });

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token)) // Token del usuario original
        .send(reservaData)
        .timeout(15000)
        .expect(400); // Debe fallar con BadRequest

      logStepV3('Respuesta error esperada:', { 
        tipo: 'error', 
        etiqueta: 'NEGOCIO' 
      }, response.body.message);
      
      // ✅ MEJORADO: Verificar que el mensaje de error es el esperado
      expect(response.body.message).toMatch(
        /vehículo.*no.*pertenece.*usuario|no.*permitido.*vehículo.*otro.*usuario|el.*vehículo.*especificado.*no.*pertenece.*al.*usuario/i
      );

      // ✅ NUEVO: Cleanup inmediato del vehículo creado para este test
      try {
        await request(app.getHttpServer())
          .delete(`/vehiculos/${otroVehiculo.id}`)
          .set(authHelper.getAuthHeader(usuarios.admin.token))
          .timeout(10000);
          
        logStepV3(`Vehículo ${otroVehiculo.id} eliminado tras test`, {
          etiqueta: "TEST_CLEANUP",
          tipo: "info"
        });
      } catch (cleanupError: any) {
        logStepV3(`Warning: No se pudo eliminar vehículo ${otroVehiculo.id}:`, {
          etiqueta: "TEST_CLEANUP",
          tipo: "warning"
        }, cleanupError.message);
      }
    });


  });

  describe('Validaciones de autorización', () => {

    it('debe permitir solo a clientes crear reservas para sí mismos', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      logStepV3('Cliente creando su propia reserva', { etiqueta: 'AUTH' }, reservaData.usuario_id);
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      logStepV3('Reserva creada exitosamente', { tipo: 'info', etiqueta: 'AUTH' }, response.body.message);

    });

    it('debe rechazar que un cliente cree reserva para otro usuario', async () => {
      const otroCliente = await authHelper.createAndLoginUser(UserRole.CLIENTE);
      const reservaData = {
        usuario_id: otroCliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      logStepV3('Cliente intentando reservar para otro usuario', { etiqueta: 'AUTH' }, reservaData.usuario_id);
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(403);

      logStepV3('Respuesta error esperada (forbidden)', { tipo: 'error', etiqueta: 'AUTH' }, response.body.message);
      expect(response.body.message).toContain('Solo puedes crear reservas para ti mismo');
    });

    it('debe rechazar acceso sin autenticación', async () => {
      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };
      logStepV3('Intentando crear reserva sin autenticación', 
        { etiqueta: 'AUTH' }, 
        `usuario_id: ${reservaData.usuario_id}
        vehiculo_id: ${reservaData.vehiculo_id}`);
      const response = await request(app.getHttpServer())
        .post('/reservas')
        .send(reservaData)
        .expect(401);

      logStepV3('Respuesta error esperada (unauthorized)', { tipo: 'error', etiqueta: 'AUTH' }, response.body.message);
      expect(response.body.message).toContain('No auth token');
    });

  });

  describe('Tests de concurrencia', () => {
    it('debe manejar correctamente intentos simultáneos de reservar la misma plaza', async () => {
      // Preparación: crear segundo cliente y su vehículo
      const cliente2 = await authHelper.createAndLoginUser(UserRole.CLIENTE);
      const vehiculo2 = await dataFixtures.createVehiculo(
        cliente2.user.id,
        cliente2.token,
        { placa: 'TEST002' }
      );

      const reservaData1 = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazas[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const reservaData2 = {
        usuario_id: cliente2.user.id,
        plaza_id: plazas[0].id, // Misma plaza
        vehiculo_id: vehiculo2.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      // Ejecutar ambas reservas simultáneamente
      const req1 = request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData1);

      const req2 = request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(cliente2.token))
        .send(reservaData2);

      const [r1, r2] = await Promise.allSettled([req1, req2]);

      // Normalización de resultados para facilitar aserciones
      const resultados = [r1, r2].map(r => {
        if (r.status === 'fulfilled') {
          return { ok: r.value.status < 400, status: r.value.status, body: r.value.body };
        } else {
          // Si la promesa fallara (no usual en supertest), contabilizar como error 500
          return { ok: false, status: 500, body: { error: r.reason?.message } };
        }
      });

      const exitosas = resultados.filter(x => x.ok && x.status === 201);
      const fallidas = resultados.filter(x => !x.ok || (x.status >= 400));

      // Opcional de depuración:
      // console.log('Resultados concurrencia:', resultados);
      // console.log('Fallidas body:', fallidas.map(f => f.body));

      expect(exitosas).toHaveLength(1);
      expect(fallidas).toHaveLength(1);
    });
  });

  describe('Tipos de plaza específicos', () => {
    it('debe permitir reservar plaza para discapacitados', async () => {
      // Crear plaza específica para discapacitados
      const plazaDiscapacitados = await dataFixtures.createPlazas(
        usuarios.admin.token,
        { count: 1, tipo: TipoPlaza.DISCAPACITADO }
      );

      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazaDiscapacitados[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      expect(response.body.data.plaza.tipo).toBe(TipoPlaza.DISCAPACITADO);
    });

    it('debe permitir reservar plaza eléctrica', async () => {
      // Crear plaza eléctrica
      const plazaElectrica = await dataFixtures.createPlazas(
        usuarios.admin.token,
        { count: 1, tipo: TipoPlaza.ELECTRICO }
      );

      const reservaData = {
        usuario_id: usuarios.cliente.user.id,
        plaza_id: plazaElectrica[0].id,
        vehiculo_id: vehiculo.id,
        fecha_inicio: dataFixtures.generateFutureDate(1),
        fecha_fin: dataFixtures.generateFutureDate(4),
      };

      const response = await request(app.getHttpServer())
        .post('/reservas')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .send(reservaData)
        .expect(201);

      expect(response.body.data.plaza.tipo).toBe(TipoPlaza.ELECTRICO);
    });
  });
  
  describe('Gestión posterior de reservas', () => {
    it('debe permitir cancelar una reserva activa', async () => {
      // Crear reserva
      const reserva = await dataFixtures.createReserva(
        usuarios.cliente.token,
        {
          usuario_id: usuarios.cliente.user.id,
          plaza: plazas[0],
          vehiculo_id: vehiculo.id,
          fecha_inicio: new Date(dataFixtures.generateFutureDate(1)), // 1 hora en futuro
          fecha_fin: new Date(dataFixtures.generateFutureDate(4)) // 4 horas en futuro
        }
      );

      // Cancelar reserva
      const response = await request(app.getHttpServer())
        .post(`/reservas/${reserva.id}/cancelar`)
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.data.estado).toBe(EstadoReservaDTO.CANCELADA);

      // Verificar que la plaza vuelve a estar libre
      const plazaResponse = await request(app.getHttpServer())
        .get(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(plazaResponse.body.data.estado).toBe(EstadoPlaza.LIBRE);
    });
  });

  describe('Rendimiento con múltiples reservas', () => {
    it('debe manejar múltiples reservas simultáneas en plazas diferentes', async () => {
      // Crear múltiples vehículos
      const vehiculos = await dataFixtures.createMultipleVehiculos(
        usuarios.cliente.user.id,
        usuarios.cliente.token,
        3
      );

      // Crear reservas para diferentes plazas simultáneamente
      const reservasPromises = vehiculos.map((veh, index) => 
        dataFixtures.createReserva(
          usuarios.cliente.token,
          {
            usuario_id: usuarios.cliente.user.id,
            plaza: plazas[index],
            vehiculo_id: veh.id,
            fecha_inicio: new Date(dataFixtures.generateFutureDate(index + 1)),
            fecha_fin: new Date(dataFixtures.generateFutureDate(index + 4))
          }
        )
      );

      const startTime = Date.now();
      const reservas = await Promise.all(reservasPromises);
      const duration = Date.now() - startTime;

      expect(reservas).toHaveLength(3);
      expect(duration).toBeLessThan(5000); // Menos de 5 segundos
      
      reservas.forEach(reserva => {
        expect(reserva.estado).toBe(EstadoReservaDTO.ACTIVA);
      });

      console.log(`⚡ ${reservas.length} reservas creadas en ${duration}ms`);
    });
  });


  afterAll(async () => {
    await app.close();
  });
  
});
