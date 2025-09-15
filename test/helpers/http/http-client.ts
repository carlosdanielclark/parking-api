// Archivo: test/helpers/http/http-client.ts
// NUEVO - Cliente HTTP común con timeouts y retries básicos
import request, { Response } from 'supertest';
import { logStepV3 } from '../log/log-util';

/**
 * Cliente HTTP centralizado para tests E2E
 * Proporciona timeouts consistentes, logging y manejo básico de errores
 */
export class HttpClient {
  constructor(private app: any) {}

  /**
   * Realiza una petición POST con manejo de errores y logging
   */
  async post(
    path: string,
    body: any,
    headers: Record<string, string> = {},
    expectStatus?: number,
    maxRetries: number = 4,
    baseTimeout: number = 16000
  ): Promise<Response> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const request_builder = request(this.app.getHttpServer())
          .post(path)
          .set(headers)
          .send(body)
          .timeout(baseTimeout + attempt * 2000);

        const response = expectStatus
          ? await request_builder.expect(expectStatus)
          : await request_builder;

        return response;
      } catch (err: any) {
        if (/ECONNRESET|timeout/.test(String(err.message))) {
          attempt++;
          await new Promise(r => setTimeout(r, 700 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Max retries (${maxRetries}) reached for POST ${path}`);
  }

  /**
   * Realiza una petición GET con manejo de errores y logging
   */
  async get(
    path: string, 
    headers: Record<string, string> = {}, 
    expectStatus?: number
  ): Promise<Response> {
    try {
      const request_builder = request(this.app.getHttpServer())
        .get(path)
        .set(headers)
        .timeout(15000);

      const response = expectStatus 
        ? await request_builder.expect(expectStatus)
        : await request_builder;
      return response;
    } catch (err: any) {
      logStepV3(`HTTP GET ${path} failed → ${err.status || 'ERROR'}`, {
        etiqueta: 'HTTP',
        tipo: 'error'
      }, {
        message: err?.message,
        body: err?.response?.body,
        status: err?.status
      });
      throw err;
    }
  }

  /**
   * Realiza una petición DELETE con manejo de errores y logging
   */
  async del(
    path: string, 
    headers: Record<string, string> = {}, 
    expectStatus?: number
  ): Promise<Response> {
    try {
      const request_builder = request(this.app.getHttpServer())
        .delete(path)
        .set(headers)
        .timeout(15000);

      const response = expectStatus 
        ? await request_builder.expect(expectStatus)
        : await request_builder;
      return response;
    } catch (err: any) {
      logStepV3(`HTTP DELETE ${path} failed → ${err.status || 'ERROR'}`, {
        etiqueta: 'HTTP',
        tipo: 'error'
      }, {
        message: err?.message,
        body: err?.response?.body,
        status: err?.status
      });
      throw err;
    }
  }

  /**
   * Realiza una petición PATCH con manejo de errores y logging
   */
  async patch(
    path: string, 
    body: any, 
    headers: Record<string, string> = {}, 
    expectStatus?: number
  ): Promise<Response> {
    try {
      const request_builder = request(this.app.getHttpServer())
        .patch(path)
        .set(headers)
        .send(body)
        .timeout(15000);

      const response = expectStatus 
        ? await request_builder.expect(expectStatus)
        : await request_builder;
      return response;
    } catch (err: any) {
      logStepV3(`HTTP PATCH ${path} failed → ${err.status || 'ERROR'}`, {
        etiqueta: 'HTTP',
        tipo: 'error'
      }, {
        message: err?.message,
        body: err?.response?.body,
        status: err?.status
      });
      throw err;
    }
  }

  /**
   * Realiza una petición PUT con manejo de errores y logging
   */
  async put(
    path: string, 
    body: any, 
    headers: Record<string, string> = {}, 
    expectStatus?: number
  ): Promise<Response> {
    try {
      const request_builder = request(this.app.getHttpServer())
        .put(path)
        .set(headers)
        .send(body)
        .timeout(15000);

      const response = expectStatus 
        ? await request_builder.expect(expectStatus)
        : await request_builder;

      return response;
    } catch (err: any) {
      logStepV3(`HTTP PUT ${path} failed → ${err.status || 'ERROR'}`, {
        etiqueta: 'HTTP',
        tipo: 'error'
      }, {
        message: err?.message,
        body: err?.response?.body,
        status: err?.status
      });
      throw err;
    }
  }

  /**
   * Realiza múltiples peticiones con retry básico para casos de ECONNRESET
   */
  async withRetry<T>(
    operation: () => Promise<T>, 
    maxRetries: number = 2, 
    delayMs: number = 200
  ): Promise<T> {
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        const isRetryable = /ECONNRESET|timeout|ENOTFOUND/i.test(String(error?.message));
        
        if (attempt >= maxRetries || !isRetryable) {
          throw error;
        }

        logStepV3(`Retry ${attempt}/${maxRetries} after ${delayMs}ms`, {
          etiqueta: 'HTTP',
          tipo: 'warning'
        }, error?.message);

        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }

    throw new Error('Flujo inesperado en withRetry');
  }
}
