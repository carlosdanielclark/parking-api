#!/bin/bash

echo "🚀 Ejecutando suite completa de pruebas E2E del sistema de parking"

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Preparando entorno de pruebas...${NC}"
export NODE_ENV=test

echo -e "${YELLOW}🧪 Ejecutando pruebas E2E por casos de uso...${NC}"

echo -e "${BLUE}📝 Caso de Uso 1: Reserva de plazas...${NC}"
npm run test:e2e:reserva
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Caso de Uso 1: EXITOSO${NC}"
else
    echo -e "${RED}❌ Caso de Uso 1: FALLÓ${NC}"
    exit 1
fi

echo -e "${BLUE}📊 Caso de Uso 2: Consulta de ocupación...${NC}"
npm run test:e2e:ocupacion
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Caso de Uso 2: EXITOSO${NC}"
else
    echo -e "${RED}❌ Caso de Uso 2: FALLÓ${NC}"
    exit 1
fi

echo -e "${BLUE}👤 Caso de Uso 3: Actualización de usuarios...${NC}"
npm run test:e2e:usuarios
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Caso de Uso 3: EXITOSO${NC}"
else
    echo -e "${RED}❌ Caso de Uso 3: FALLÓ${NC}"
    exit 1
fi

echo -e "${BLUE}📈 Caso de Uso 4: Acceso a logs...${NC}"
npm run test:e2e:logs
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Caso de Uso 4: EXITOSO${NC}"
else
    echo -e "${RED}❌ Caso de Uso 4: FALLÓ${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Suite de pruebas E2E completada exitosamente${NC}"
echo -e "${BLUE}📊 Ejecutando reporte de cobertura completo...${NC}"
npm run test:e2e:cov

echo -e "${GREEN}✅ Todas las pruebas E2E completadas${NC}"