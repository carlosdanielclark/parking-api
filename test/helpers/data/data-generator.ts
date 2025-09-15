// Archivo: test/helpers/data/data-generator.ts
// Fachada que delega en IdUniqueness
import { randomBytes } from 'crypto'; // MANTENIDO por compatibilidad
import { logStepV3 } from '../log/log-util';
import { IdUniqueness } from './id-uniqueness';

export class DataGenerator {
  // Sets estáticos, mantener por compatibilidad
  private static usedPlazaIds: Set<string> = new Set();
  private static usedVehicleIds: Set<string> = new Set();

  /**
   * Limpia completamente el estado estático
   * Ahora se llama consistentemente entre tests
   */
  static clearStaticState(): void {
    this.usedPlazaIds.clear();
    this.usedVehicleIds.clear();
    logStepV3('🧹 Estado estático limpiado completamente', {
        etiqueta: "CLEAR_STATE"
    });
  }

  /**
   * Genera IDs únicos con timestamp y random criptográfico
   * Mayor entropía para evitar colisiones en entornos concurrentes
   */
  static generateUniquePlazaId(): string {
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      // Usar timestamp de alta resolución y random criptográfico
      const timestamp = Date.now().toString(36).slice(-4);
      const random = randomBytes(4).toString('hex').toUpperCase().slice(0, 4);
      const plazaId = `A${timestamp}${random}`.slice(0, 5); // Longitud máxima 8 caracteres
      
      if (!this.usedPlazaIds.has(plazaId)) {
        this.usedPlazaIds.add(plazaId);
        return plazaId;
      }
      
      attempts++;
    }
    
    throw new Error('No se pudo generar ID único para plaza después de 100 intentos');
  }

  /**
   * Genera placas únicas para vehículos
   * Usa random criptográfico para mayor unicidad
   */
  static generateUniqueVehiclePlate(): string {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
      const letters = randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
      const numbers = Math.floor(100 + Math.random() * 900).toString();
      const plate = `${letters}${numbers}`;
      
      if (!this.usedVehicleIds.has(plate)) {
        this.usedVehicleIds.add(plate);
        return plate;
      }
      
      attempts++;
    }
    
    throw new Error('No se pudo generar placa única después de 50 intentos');
  }

  /**
   * NUEVO: Método conveniente para generar múltiples numero_plaza únicos
   */
  static generateMultiplePlazaIds(count: number, prefix: string = 'A'): string[] {
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      results.push(IdUniqueness.genNumeroPlaza(prefix));
    }
    return results;
  }

  /**
   * NUEVO: Método conveniente para generar múltiples placas únicas
   */
  static generateMultiplePlacas(count: number): string[] {
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      results.push(IdUniqueness.genPlaca());
    }
    return results;
  }

  /**
   * Obtener estadísticas de generación (útil para debugging)
   */
  static getGenerationStats() {
    return {
      uniqueness: IdUniqueness.getStats(),
      obsolete: {
        usedPlazaIds: this.usedPlazaIds.size,
        usedVehicleIds: this.usedVehicleIds.size,
      }
    };
  }
}
