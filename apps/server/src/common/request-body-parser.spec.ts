import { Body, Controller, Module, Patch } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as http from 'node:http';
import { configureRequestBodyParser } from './request-body-parser';

@Controller('admin/subscription-templates')
class BodyParserProbeController {
  @Patch(':id')
  receive(@Body() body: { content: string }) {
    return { length: body.content.length };
  }
}

@Module({ controllers: [BodyParserProbeController] })
class BodyParserProbeModule {}

function sendJson(url: string, content: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ content }));
  });
}

describe('request body parser', () => {
  let app: NestExpressApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(BodyParserProbeModule, { bodyParser: false, logger: false });
    configureRequestBodyParser(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('test server did not expose a port');
    baseUrl = `http://127.0.0.1:${address.port}/admin/subscription-templates/template-id`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a template-sized JSON body above the default 100kb limit', async () => {
    const response = await sendJson(baseUrl, 'x'.repeat(120 * 1024));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ length: 120 * 1024 });
  });

  it('keeps a bounded request body limit', async () => {
    const response = await sendJson(baseUrl, 'x'.repeat(2 * 1024 * 1024));

    expect(response.status).toBe(413);
  });
});
