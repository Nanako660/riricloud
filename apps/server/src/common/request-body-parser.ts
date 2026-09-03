import type { NestExpressApplication } from '@nestjs/platform-express';

export const REQUEST_BODY_LIMIT = '2mb';

export function configureRequestBodyParser(app: NestExpressApplication) {
  app.useBodyParser('json', { limit: REQUEST_BODY_LIMIT });
  app.useBodyParser('urlencoded', { extended: true, limit: REQUEST_BODY_LIMIT });
}
