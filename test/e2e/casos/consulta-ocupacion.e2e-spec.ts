
// test/e2e/casos/consulta-ocupacion.e2e-spec.ts
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { AuthHelper, TestUser } from '../../helpers/auth-helper';
import { DataFixtures } from '../../helpers/data-fixtures';
import { UserRole } from '../../../src/entities/user.entity';
import { EstadoPlaza, TipoPlaza } from '../../../src/entities/plaza.entity';

/**
 * Tests E2E para Caso de Uso 2: Consultar Ocupación del Parking
 * 
 * Cubre el flujo donde un empleado desea conocer la ocupación actual del parking,
 * consultando información sobre plazas ocupadas, libres y estadísticas generales.
 */
describe('Caso de Uso 2: Consultar Ocupación del Parking (E2E)', () => {
  let app: INestApplication;
  let authHelper: AuthHelper;
  let dataFixtures: DataFixtures;
  let usuarios: {
    admin: TestUser;
    empleado: TestUser;
    cliente: TestUser;
  };
  let plazas: any[];

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
    usuarios = await authHelper.createMultipleUsers();
    
    // Crear mix realista de plazas por tipo
    plazas = await dataFixtures.createPlazas(usuarios.admin.token, {
      count: 20, // 20 plazas total
      estado: EstadoPlaza.LIBRE
    });

    console.log(`🏢 Setup completado: ${plazas.length} plazas creadas`);
  });

  describe('Consulta de ocupación por empleado', () => {
    it('debe permitir a un empleado consultar la ocupación actual del parking', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        total: 20,
        ocupadas: 0,
        libres: 20,
        mantenimiento: 0,
        porcentajeOcupacion: 0,
        disponibles: 20,
      });

      expect(response.body.timestamp).toBeDefined();
      console.log('✅ Ocupación inicial obtenida:', response.body.data);
    });

    it('debe mostrar ocupación actualizada después de crear reservas', async () => {
      // Crear cliente con vehículos
      const clienteData = await authHelper.createClienteWithVehiculo();

      // Crear 3 reservas para ocupar plazas
      const reservasPromises = [
        dataFixtures.createReserva(
          clienteData.cliente.user.id, 
          plazas[0].id, 
          clienteData.vehiculo.id, 
          clienteData.cliente.token
        ),
        dataFixtures.createReserva(
          clienteData.cliente.user.id, 
          plazas[1].id, 
          clienteData.vehiculo.id, 
          clienteData.cliente.token,
          { horasEnElFuturo: 4, duracionHoras: 2 }
        ),
        dataFixtures.createReserva(
          clienteData.cliente.user.id, 
          plazas[2].id, 
          clienteData.vehiculo.id, 
          clienteData.cliente.token,
          { horasEnElFuturo: 8, duracionHoras: 3 }
        ),
      ];

      await Promise.all(reservasPromises);

      // Consultar ocupación actualizada
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(response.body.data).toMatchObject({
        total: 20,
        ocupadas: 3,
        libres: 17,
        mantenimiento: 0,
        porcentajeOcupacion: 15, // 3/20 = 15%
        disponibles: 17,
      });

      console.log('✅ Ocupación después de reservas:', response.body.data);
    });

    it('debe mostrar estadísticas correctas por tipo de plaza', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(response.body.data).toHaveProperty('plazasPorTipo');
      
      const plazasPorTipo = response.body.data.plazasPorTipo;
      expect(plazasPorTipo).toHaveProperty('normal');
      expect(plazasPorTipo).toHaveProperty('discapacitado');  
      expect(plazasPorTipo).toHaveProperty('electrico');

      // Verificar estructura de cada tipo
      Object.values(plazasPorTipo).forEach((tipo: any) => {
        expect(tipo).toHaveProperty('total');
        expect(tipo).toHaveProperty('libres');
        expect(tipo).toHaveProperty('ocupadas');
        expect(typeof tipo.total).toBe('number');
        expect(typeof tipo.libres).toBe('number');
        expect(typeof tipo.ocupadas).toBe('number');
      });

      console.log('✅ Estadísticas por tipo:', plazasPorTipo);
    });

    it('debe calcular porcentajes de ocupación correctamente', async () => {
      // Crear reservas para 50% de ocupación (10 de 20 plazas)
      const clienteData = await authHelper.createClienteWithVehiculo();
      
      const vehiculosAdicionales = await dataFixtures.createMultipleVehiculos(
        clienteData.cliente.user.id,
        clienteData.cliente.token,
        5
      );

      // Crear 10 reservas usando diferentes vehículos
      const reservasPromises: any[] = [];
      for (let i = 0; i < 10; i++) {
        const vehiculo = i === 0 ? clienteData.vehiculo : vehiculosAdicionales[i % 5];
        reservasPromises.push(
          dataFixtures.createReserva(
            clienteData.cliente.user.id,
            plazas[i].id,
            vehiculo.id,
            clienteData.cliente.token,
            { horasEnElFuturo: i + 1, duracionHoras: 2 }
          )
        );
      }

      await Promise.all(reservasPromises);

      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(response.body.data).toMatchObject({
        total: 20,
        ocupadas: 10,
        libres: 10,
        porcentajeOcupacion: 50, // 10/20 = 50%
      });

      console.log('✅ Ocupación al 50%:', response.body.data);
    });

    it('debe incluir información sobre próximas liberaciones', async () => {
      // Crear reserva que termine pronto
      const clienteData = await authHelper.createClienteWithVehiculo();
      
      await dataFixtures.createReserva(
        clienteData.cliente.user.id,
        plazas[0].id,
        clienteData.vehiculo.id,
        clienteData.cliente.token,
        { horasEnElFuturo: 1, duracionHoras: 2 }
      );

      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      if (response.body.data.proximasLiberaciones) {
        expect(Array.isArray(response.body.data.proximasLiberaciones)).toBe(true);
        
        if (response.body.data.proximasLiberaciones.length > 0) {
          const liberacion = response.body.data.proximasLiberaciones[0];
          expect(liberacion).toHaveProperty('plaza_numero');
          expect(liberacion).toHaveProperty('fecha_liberacion');
          expect(liberacion).toHaveProperty('tiempo_restante_minutos');
        }
      }
    });
  });

  describe('Consulta de plazas disponibles', () => {
    it('debe mostrar todas las plazas libres', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/disponibles')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(20);
      expect(response.body.data.every(plaza => plaza.estado === EstadoPlaza.LIBRE)).toBe(true);
    });

    it('debe permitir filtrar plazas disponibles por tipo', async () => {
      // Crear plazas específicas de cada tipo
      await dataFixtures.createPlazas(usuarios.admin.token, {
        count: 3,
        tipo: TipoPlaza.ELECTRICO
      });

      const response = await request(app.getHttpServer())
        .get('/plazas/disponibles?tipo=electrico')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.every(plaza => plaza.tipo === TipoPlaza.ELECTRICO)).toBe(true);
    });

    it('debe excluir plazas ocupadas de la lista de disponibles', async () => {
      // Ocupar una plaza
      const clienteData = await authHelper.createClienteWithVehiculo();
      
      await dataFixtures.createReserva(
        clienteData.cliente.user.id,
        plazas[0].id,
        clienteData.vehiculo.id,
        clienteData.cliente.token
      );

      const response = await request(app.getHttpServer())
        .get('/plazas/disponibles')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.data).toHaveLength(19); // Una menos
      expect(response.body.data.find(plaza => plaza.id === plazas[0].id)).toBeUndefined();
    });

    it('debe excluir plazas en mantenimiento', async () => {
      // Poner plaza en mantenimiento
      await request(app.getHttpServer())
        .patch(`/plazas/${plazas[0].id}`)
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .send({ estado: EstadoPlaza.MANTENIMIENTO })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/plazas/disponibles')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);

      expect(response.body.data).toHaveLength(19);
      expect(response.body.data.find(plaza => plaza.id === plazas[0].id)).toBeUndefined();
    });
  });

  describe('Control de acceso por roles', () => {
    it('debe permitir acceso a empleados y administradores', async () => {
      // Empleado
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      // Admin
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.admin.token))
        .expect(200);
    });

    it('debe rechazar acceso a clientes para ocupación detallada', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(403);

      expect(response.body.message).toContain('Acceso denegado');
    });

    it('debe permitir a clientes ver plazas disponibles', async () => {
      await request(app.getHttpServer())
        .get('/plazas/disponibles')
        .set(authHelper.getAuthHeader(usuarios.cliente.token))
        .expect(200);
    });

    it('debe rechazar acceso sin autenticación', async () => {
      await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .expect(401);
    });
  });

  describe('Tiempo real y consistencia de datos', () => {
    it('debe reflejar cambios inmediatos tras operaciones', async () => {
      // Ocupación inicial
      let ocupacionResponse = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      const ocupacionInicial = ocupacionResponse.body.data.ocupadas;

      // Crear reserva
      const clienteData = await authHelper.createClienteWithVehiculo();
      await dataFixtures.createReserva(
        clienteData.cliente.user.id,
        plazas[0].id,
        clienteData.vehiculo.id,
        clienteData.cliente.token
      );

      // Verificar cambio inmediato
      ocupacionResponse = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(ocupacionResponse.body.data.ocupadas).toBe(ocupacionInicial + 1);
    });

    it('debe mantener consistencia entre ocupación y plazas disponibles', async () => {
      const [ocupacionRes, disponiblesRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/plazas/ocupacion')
          .set(authHelper.getAuthHeader(usuarios.empleado.token)),
        request(app.getHttpServer())
          .get('/plazas/disponibles')
          .set(authHelper.getAuthHeader(usuarios.cliente.token))
      ]);

      const ocupacion = ocupacionRes.body.data;
      const disponibles = disponiblesRes.body.data.length;

      expect(ocupacion.libres).toBe(disponibles);
      expect(ocupacion.total).toBe(ocupacion.ocupadas + ocupacion.libres + ocupacion.mantenimiento);
    });
  });

  describe('Rendimiento con datos masivos', () => {
    it('debe responder rápidamente con muchas plazas', async () => {
      // Crear más plazas para simular parking grande
      await dataFixtures.createPlazas(usuarios.admin.token, { 
        count: 100,
        prefix: 'B'
      });

      const startTime = Date.now();
      
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(3000); // Menos de 3 segundos
      expect(response.body.data.total).toBe(120); // 20 + 100 plazas

      console.log(`⚡ Consulta de ocupación con ${response.body.data.total} plazas en ${responseTime}ms`);
    }, 10000);

    it('debe manejar consultas concurrentes sin degradación', async () => {
      const promesasConsulta: any[] = [];
      const numeroConsultas = 5;

      for (let i = 0; i < numeroConsultas; i++) {
        promesasConsulta.push(
          request(app.getHttpServer())
            .get('/plazas/ocupacion')
            .set(authHelper.getAuthHeader(usuarios.empleado.token))
        );
      }

      const startTime = Date.now();
      const resultados = await Promise.all(promesasConsulta);
      const totalTime = Date.now() - startTime;

      // Todas las consultas deben ser exitosas
      resultados.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Tiempo total razonable para consultas concurrentes
      expect(totalTime).toBeLessThan(5000);

      console.log(`⚡ ${numeroConsultas} consultas concurrentes completadas en ${totalTime}ms`);
    });
  });

  describe('Información detallada y tendencias', () => {
    it('debe incluir tendencias de ocupación cuando esté disponible', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      if (response.body.data.tendenciaOcupacion) {
        const tendencia = response.body.data.tendenciaOcupacion;
        expect(tendencia).toHaveProperty('hora_actual');
        expect(tendencia).toHaveProperty('promedio_semanal');
        expect(typeof tendencia.hora_actual).toBe('number');
      }
    });

    it('debe mostrar distribución realista de tipos de plaza', async () => {
      const response = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      const porTipo = response.body.data.plazasPorTipo;
      const totalPorTipo = porTipo.normal.total + porTipo.discapacitado.total + porTipo.electrico.total;
      
      expect(totalPorTipo).toBe(response.body.data.total);
      
      // Verificar que hay más plazas normales (distribución típica)
      expect(porTipo.normal.total).toBeGreaterThan(porTipo.discapacitado.total);
      expect(porTipo.normal.total).toBeGreaterThan(porTipo.electrico.total);
    });
  });

  describe('Integración con sistema de reservas', () => {
    it('debe mostrar impacto inmediato de cancelación de reservas', async () => {
      // Crear y cancelar reserva
      const clienteData = await authHelper.createClienteWithVehiculo();
      
      const reserva = await dataFixtures.createReserva(
        clienteData.cliente.user.id,
        plazas[0].id,
        clienteData.vehiculo.id,
        clienteData.cliente.token
      );

      // Verificar ocupación con reserva activa
      let ocupacionRes = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(ocupacionRes.body.data.ocupadas).toBe(1);

      // Cancelar reserva
      await request(app.getHttpServer())
        .post(`/reservas/${reserva.id}/cancelar`)
        .set(authHelper.getAuthHeader(clienteData.cliente.token))
        .expect(200);

      // Verificar ocupación tras cancelación
      ocupacionRes = await request(app.getHttpServer())
        .get('/plazas/ocupacion')
        .set(authHelper.getAuthHeader(usuarios.empleado.token))
        .expect(200);

      expect(ocupacionRes.body.data.ocupadas).toBe(0);
      expect(ocupacionRes.body.data.libres).toBe(20);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
