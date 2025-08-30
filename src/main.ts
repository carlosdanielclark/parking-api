import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('Parking API')
    .setDescription('Documentación de la API de gestión de parking')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ✅ Habilitar validaciones globales
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // elimina campos no definidos en DTO
      forbidNonWhitelisted: true,   // lanza error si llegan campos extra
      transform: true,              // transforma payloads al tipo de DTO
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🚀 Application listening on port ${process.env.PORT || 3000}`);
}
bootstrap();

