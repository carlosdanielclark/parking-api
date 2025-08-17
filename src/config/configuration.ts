import {
  getEnvNumber,
  getEnvString,
  getEnvNumberOrDefault,
  getEnvStringOrDefault,
} from '../helpers/validate_helper';

export default () => ({
  port: getEnvNumberOrDefault('PORT', 3000),
  nodeEnv: getEnvStringOrDefault('NODE_ENV', 'development'),
  database: {
    postgres: {
      host: getEnvString('POSTGRES_HOST'),
      port: getEnvNumber('POSTGRES_PORT'),
      username: getEnvString('POSTGRES_USERNAME'),
      password: getEnvString('POSTGRES_PASSWORD'),
      database: getEnvString('POSTGRES_DATABASE'),
    },
    mongo: {
      host: getEnvString('MONGODB_HOST'),
      port: getEnvNumber('MONGODB_PORT'),
      database: getEnvString('MONGODB_DATABASE'),
      // Opcional: usuario y contraseña si aplica
      // username: getEnvStringOrDefault('MONGODB_USERNAME', ''),
      // password: getEnvStringOrDefault('MONGODB_PASSWORD', ''),
    },
  },
  jwt: {
    secret: getEnvString('JWT_SECRET'),       // << correción aquí: JWT_SECRET en mayúsculas exactas
    expirationTime: getEnvNumber('JWT_EXPIRATION_TIME'),
  },
});
