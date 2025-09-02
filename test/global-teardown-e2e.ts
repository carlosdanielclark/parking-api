export default async function globalTeardown() {
  console.log('🔄 [E2E] Teardown global iniciado');
  
  // Detener servidor MongoDB
  if ((global as any).__MONGOD__) {
    await (global as any).__MONGOD__.stop();
    console.log('✅ [MongoDB] Servidor detenido');
  }
  
  console.log('✅ [E2E] Teardown global completado');
}