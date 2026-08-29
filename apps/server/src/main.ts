import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { registerWebStatic } from './static/web-static';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api/v1');
  // 默认所有端点需要 JWT，@Public() 显式放行（安全红线：服务端默认拒绝）
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.enableCors({ origin: true, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RiriCloud API')
    .setDescription('RiriCloud 主控端 REST API（契约见 docs/API_AND_PROTOCOLS.md）')
    .setVersion(process.env.npm_package_version || '0.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  // Web 面板静态托管与 SPA 回退（存在 web dist 时启用，见 static/web-static.ts）
  registerWebStatic(app);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
