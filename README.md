
# API de Parking

## Descripción del proyecto

API RESTful construida con Node.js y NestJS para la gestión completa de un sistema de aparcamiento. La aplicación permite reservar plazas de parking para vehículos, consultar la ocupación actual, gestionar usuarios con roles administrativos, empleados y clientes, y acceder a logs detallados de auditoría. Utiliza autenticación basada en JWT y autorización por roles para controlar el acceso a las funcionalidades. La persistencia combina PostgreSQL para las entidades principales y MongoDB para almacenar logs de actividad.

---

## Estructura del proyecto

```text
parking-app/
├── dist/                           \# Archivos compilados
├── node_modules/                   \# Dependencias del proyecto
├── src/                           \# Código fuente principal
│   ├── admin/                     \# Módulo y controladores para administración de logs y dashboard
│   ├── auth/                      \# Autenticación JWT y autorización por roles
│   ├── users/                     \# Gestión CRUD de usuarios
│   ├── plazas/                    \# Gestión de plazas de parking
│   ├── vehiculos/                 \# Gestión de vehículos
│   ├── reservas/                  \# Gestión de reservas de plaza
│   ├── logs/                      \# Consulta y gestión de logs
│   ├── logging/                   \# Servicio centralizado de logging con MongoDB
│   ├── config/                    \# Configuración de la aplicación y variables de entorno
│   ├── database/                  \# Servicios para conexión y pruebas de bases de datos
│   ├── entities/                  \# Entidades para TypeORM (User, Plaza, Vehiculo, Reserva)
│   ├── schemas/                   \# Esquema de logs para Mongoose
│   ├── helpers/                   \# Helpers y validaciones
│   ├── testing/                   \# Pruebas unitarias y e2e específicas
│   ├── app.controller.ts          \# Controlador raíz
│   ├── app.module.ts              \# Módulo raíz que integra todos los módulos
│   └── main.ts                   \# Punto de entrada de la aplicación
├── test/                         \# Pruebas E2E y configuración de tests
├── .env                          \# Variables de entorno para configuración local
├── package.json                  \# Configuración de NPM y scripts
├── README.md                     \# Documentación del proyecto (actual)
└── tsconfig.json                 \# Configuración de TypeScript
```

---

## Pasos para ejecutar el proyecto de manera local

### Requisitos previos

- Node.js (versión 18 o superior recomendada)
- npm o pnpm como gestor de paquetes
- PostgreSQL instalado y en funcionamiento
- MongoDB instalado y en funcionamiento
- Configuración correcta de las variables de entorno (ver `.env`)

### Configuración de la base de datos

1. Crear la base de datos en PostgreSQL (por ejemplo `parking_db`).

```

createdb parking_db

```

2. Asegurar que MongoDB está corriendo y accesible (configurado por defecto en `localhost:27017`).

### Variables de entorno

Asegúrese de configurar el archivo `.env` en la raíz del proyecto con los siguientes valores ajustados a su entorno:

```


# PostgreSQL Configuration

POSTGRES_HOST=
POSTGRES_PORT=
POSTGRES_USERNAME=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=

# MongoDB Configuration

MONGODB_HOST=
MONGODB_PORT=
MONGODB_DATABASE=

# JWT Configuration

JWT_SECRET=tu_jwt_secret_super_seguro_aquí
JWT_EXPIRATION_TIME=3600

# Application Configuration

PORT=
NODE_ENV=

```

### Instalación de dependencias

Ejecutar el comando para instalar todas las dependencias:

```

npm install

```

o si usa pnpm:

```

pnpm install

```

### Ejecutar migraciones y sembrar datos iniciales

Si se tienen scripts para migraciones o semillas, ejecutar para crear esquemas y usuarios iniciales (incluye admin y usuarios de prueba).

```

pnpm run migration:run     \# o el comando equivalente configurado
pnpm run seed              \# para crear usuarios admin, empleado y cliente

```

### Iniciar la aplicación localmente

Arrancar el servidor NestJS:

```

pnpm run start:dev

```

El servidor quedará escuchando por defecto en `http://localhost:3000`.

### Uso de la API

- Registro y login: endpoints `/auth/register` y `/auth/login`.
- Gestión de usuarios: `/users` (según permisos).
- Reservas: `/reservas`.
- Consulta ocupación: `/ocupacion`.
- Gestión de plazas: `/plazas`.
- Gestión vehículos: `/vehiculos`.
- Logs administrativos bajo `/admin/logs`.

### Nota sobre pruebas E2E

Se incluyen pruebas end-to-end automatizadas usando Jest y Supertest. Para ejecutar el suite completo:

```

npm run test:e2e

```

Esto garantiza que todos los casos de uso funcionan correctamente en un entorno controlado.

---

Para detalles avanzados, puede consultar la documentación técnica más detallada en el repositorio o los comentarios de código fuente en la carpeta `src/`.

---

Este proyecto proporciona un sistema robusto y seguro para la gestión integral de parkings, combinando una arquitectura modular con autenticación, roles y auditoría completa con logs almacenados en MongoDB.

<div style="text-align: center">⁂</div>


