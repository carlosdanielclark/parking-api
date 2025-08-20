import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { TipoPlaza } from '../../src/entities/plaza.entity';

export class DataFixtures {
  constructor(private app: INestApplication) {}

  async createPlazas(adminToken: string, count: number = 5): Promise<any[]> {
    const plazas: any[] = [];
    
    for (let i = 1; i <= count; i++) {
      const plazaData = {
        numero_plaza: `A${i.toString().padStart(3, '0')}`,
        ubicacion: `Planta Baja - Sector A - Plaza ${i}`,
        tipo: i <= 2 ? TipoPlaza.NORMAL : 
              i === 3 ? TipoPlaza.DISCAPACITADO : 
              TipoPlaza.ELECTRICO,
      };

      const response = await request(this.app.getHttpServer())
        .post('/plazas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(plazaData)
        .expect(201);

      plazas.push(response.body.data);
    }

    return plazas;
  }

  async createVehiculo(clienteId: string, clienteToken: string, customData?: any): Promise<any> {
    const vehiculoData = {
      placa: customData?.placa || 'ABC123',
      marca: 'Toyota',
      modelo: 'Corolla',
      color: 'Blanco',
      usuario_id: clienteId,
      ...customData,
    };

    const response = await request(this.app.getHttpServer())
      .post('/vehiculos')
      .set('Authorization', `Bearer ${clienteToken}`)
      .send(vehiculoData)
      .expect(201);

    return response.body.data;
  }

  async createReserva(
    userId: string,
    plazaId: number,
    vehiculoId: string,
    token: string,
    customDates?: { inicio: string; fin: string }
  ): Promise<any> {
    const ahora = new Date();
    const inicio = customDates?.inicio || new Date(ahora.getTime() + (60 * 60 * 1000)).toISOString(); // 1 hora desde ahora
    const fin = customDates?.fin || new Date(ahora.getTime() + (4 * 60 * 60 * 1000)).toISOString(); // 4 horas desde ahora

    const reservaData = {
      usuario_id: userId,
      plaza_id: plazaId,
      vehiculo_id: vehiculoId,
      fecha_inicio: inicio,
      fecha_fin: fin,
    };

    const response = await request(this.app.getHttpServer())
      .post('/reservas')
      .set('Authorization', `Bearer ${token}`)
      .send(reservaData)
      .expect(201);

    return response.body.data;
  }

  generateFutureDate(hoursFromNow: number): string {
    const fecha = new Date();
    fecha.setHours(fecha.getHours() + hoursFromNow);
    return fecha.toISOString();
  }

  generatePastDate(hoursAgo: number): string {
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - hoursAgo);
    return fecha.toISOString();
  }
}