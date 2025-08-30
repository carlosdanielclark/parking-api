#!/usr/bin/env node
/**
 * Script para configurar base de datos y ejecutar migraciones
 * Uso: pnpm run db:setup
 */
const { execSync } = require('child_process');
const path = require('path');

console.log('🔧 Configurando base de datos...');

try {
  // 1. Compilar migraciones
  console.log('📦 Compilando migraciones...');
  execSync('pnpm run build', { stdio: 'inherit' });
  
  // 2. Ejecutar migraciones
  console.log('🚀 Ejecutando migraciones...');
  execSync('pnpm run migration:run', { stdio: 'inherit' });
  
  console.log('✅ Base de datos configurada exitosamente');
} catch (error) {
  console.error('❌ Error en configuración de base de datos:', error.message);
  process.exit(1);
}
