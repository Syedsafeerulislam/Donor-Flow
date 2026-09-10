import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express, { Request, Response } from 'express';
import { AppModule } from '../src/app.module';

// Vercel serverless entrypoint for the NestJS API. Mirrors src/main.ts's setup, minus
// app.listen() - a serverless function never binds a port, it just handles one request at a
// time. The bootstrapped Express app is cached across warm invocations of the same function
// instance (a fresh one only spins up on a cold start), so this only pays Nest's init cost once
// per instance rather than per-request.
const expressApp = express();

let bootstrapPromise: Promise<express.Express> | undefined;

async function bootstrap(): Promise<express.Express> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.setGlobalPrefix('api', { exclude: ['/', '/docs'] });

  // Keep this — it's the correct way to handle webhook raw body.
  app.use('/api/payments/webhook', express.raw({ type: '*/*' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use(cookieParser());

  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('DonorFlow API')
    .setDescription('DonorFlow MVP API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.init();
  return expressApp;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  const server = await bootstrapPromise;
  server(req, res);
}
