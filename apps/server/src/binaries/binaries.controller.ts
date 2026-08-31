import { Body, Controller, Get, Headers, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Roles } from '../common/roles.decorator';
import { ImportBinaryDto } from './dto/import-binary.dto';
import { BinariesService } from './binaries.service';

@ApiTags('binaries')
@Controller()
export class BinariesController {
  constructor(private readonly binaries: BinariesService) {}

  @Public()
  @Get('install.sh')
  install(@Res({ passthrough: true }) response: Response) {
    const script = this.binaries.getInstallScript();
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Content-Length', Buffer.byteLength(script, 'utf8'));
    response.setHeader('Content-Disposition', 'inline; filename="install-agent.sh"');
    return script;
  }

  @Public()
  @Get('downloads/binaries/:target')
  async download(
    @Param('target') target: string,
    @Query('token') token: string | undefined,
    @Headers('x-agent-token') headerToken: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.binaries.authorizeDownload(token ?? headerToken);
    const asset = this.binaries.getAsset(target);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', asset.size);
    response.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
    return new StreamableFile(createReadStream(asset.path));
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/binaries/info')
  info() {
    return this.binaries.getInfo();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/binaries/import')
  import(@Body() dto: ImportBinaryDto) {
    return this.binaries.importRemote(dto);
  }
}
