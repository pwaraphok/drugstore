import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  const docs = new DocumentBuilder()
    .setTitle('Drugstore API')
    .setDescription('Pharmacy management API per drugstore.v2')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docs));
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '127.0.0.1');
}

bootstrap();
