// Archivo: test/helpers/uniqueness/uniqueness-util.ts
import { logStepV3 } from "../log/log-util";

export class UniquenessUtil {
  private static namespaces: Map<string, Set<string>> = new Map();
  private static runId: string = '';

  static initializeRun(): string {
    // Generar un ID único para esta ejecución de test
    UniquenessUtil.runId = Math.random().toString(36).substring(2, 6).toUpperCase();
    UniquenessUtil.namespaces.clear();
    logStepV3(`🆔 Nuevo run inicializado: ${UniquenessUtil.runId}`, {etiqueta: "UNIQ LOG"});
    return UniquenessUtil.runId;
  }

  static clearAllNamespaces(): void {
    const namespacesCleared = Array.from(UniquenessUtil.namespaces.keys());
    UniquenessUtil.namespaces.clear();
    
    logStepV3(`🧹 Uniqueness namespaces cleared. ID: ${UniquenessUtil.runId}`, {etiqueta: "UNIQ LOG"}, namespacesCleared);
  }

  static generateUnique(namespace: string, prefix: string = ''): string {
    if (!UniquenessUtil.namespaces.has(namespace)) {
      UniquenessUtil.namespaces.set(namespace, new Set());
    }

    const namespaceSet = UniquenessUtil.namespaces.get(namespace)!;
    let attempt = 0;
    const maxAttempts = 1000;

    while (attempt < maxAttempts) {
      // Incorporar runId para evitar colisiones entre ejecuciones
      const timestamp = Date.now().toString().slice(-4);
      const random = Math.floor(Math.random() * 10000);
      const candidate = `${prefix}${timestamp}${random}${UniquenessUtil.runId}`.substring(0, 8);

      if (!namespaceSet.has(candidate)) {
        namespaceSet.add(candidate);
        return candidate;
      }
      
      attempt++;
    }

    throw new Error(`No se pudo generar valor único después de ${maxAttempts} intentos en namespace ${namespace}`);
  }
}
