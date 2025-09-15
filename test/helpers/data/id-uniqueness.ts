// Archivo: test/helpers/data/id-uniqueness.ts
// NUEVO - Núcleo de unicidad para placas y numero_plaza
import { randomBytes } from 'crypto';
import { logStepV3 } from '../log/log-util';

type Scope = 'plaza' | 'placa' | 'vehiculo';

class Namespace {
  private used = new Set<string>();
  private counter = 0;
  
  constructor(private name: Scope, private testRunId: string) {}

  has(v: string) { return this.used.has(v); }
  add(v: string) { this.used.add(v); }
  clear() { this.used.clear(); this.counter = 0; }

  nextCounter() { this.counter += 1; return this.counter; }
  tag() { return `${this.name}-${this.testRunId}`; }

  // Métodos públicos para acceder a las propiedades privadas
  getUsedSize() { return this.used.size; }
  getCounter() { return this.counter; }
}

export class IdUniqueness {
  private static testRunId = Math.random().toString(36).substring(2, 6).toUpperCase();
  private static nsPlaza = new Namespace('plaza', IdUniqueness.testRunId);
  private static nsPlaca = new Namespace('placa', IdUniqueness.testRunId);

  static clearAll() {
    this.nsPlaza.clear();
    this.nsPlaca.clear();
    logStepV3('🧹 Uniqueness namespaces cleared', { 
      etiqueta: 'UNIQ', 
      tipo: 'info' 
    }, { 
      run: this.testRunId 
    });
  }

  // numero_plaza: máx 5 chars, prefijo A|B recomendado
  static genNumeroPlaza(prefix: string = 'A', maxAttempts = 50): string {
    for (let a = 0; a < maxAttempts; a++) {
      const ctr = this.nsPlaza.nextCounter().toString().padStart(2, '0');
      const ts = Date.now().toString().slice(-3);
      const num = `${prefix}${ts}${ctr}`.substring(0, 5);

      if (!this.nsPlaza.has(num)) {
        this.nsPlaza.add(num);
        return num;
      }
    }
    const fb = `${prefix}${randomBytes(2).toString('hex').toUpperCase().slice(0, 4)}`.substring(0, 5);
    logStepV3('⚡ Fallback numero_plaza', { 
      etiqueta: 'UNIQ', 
      tipo: 'warning' 
    }, fb);
    this.nsPlaza.add(fb);
    return fb;
  }

  // placa: [A-Z0-9]{1,10}, sugerido ABC123
  static genPlaca(maxAttempts = 50): string {
    for (let a = 0; a < maxAttempts; a++) {
      const letters = randomBytes(2).toString('hex').toUpperCase().slice(0, 3).replace(/[^A-Z]/g, 'A');
      const numbers = Math.floor(100 + Math.random() * 900).toString();
      const cand = `${letters}${numbers}`; // ej: ABC123
      
      if (cand.length <= 10 && /^[A-Z0-9]+$/.test(cand) && !this.nsPlaca.has(cand)) {
        this.nsPlaca.add(cand);
        return cand;
      }
    }
    const fb = `PL${Date.now().toString().slice(-6)}`.substring(0, 10);
    logStepV3('⚡ Fallback placa', { 
      etiqueta: 'UNIQ', 
      tipo: 'warning' 
    }, fb);
    this.nsPlaca.add(fb);
    return fb;
  }

  // Método para obtener estadísticas de uso (útil para debugging)
  static getStats() {
    return {
      testRunId: this.testRunId,
      plazas: {
        used: this.nsPlaza.getUsedSize(),
        counter: this.nsPlaza.getCounter(),
      },
      placas: {
        used: this.nsPlaca.getUsedSize(),
        counter: this.nsPlaca.getCounter(),
      }
    };
  }
}