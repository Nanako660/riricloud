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
  @Get('downloads/agent')
  async downloadAgent(
    @Headers('user-agent') userAgent: string | undefined,
    @Query('token') token: string | undefined,
    @Headers('x-agent-token') headerToken: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    const credential = token ?? headerToken;
    await this.binaries.authorizeDownload(credential);
    if (!credential) throw new Error('缺少 AgentToken');
    const target = this.binaries.resolveAgentTarget(userAgent);
    response.redirect(302, this.binaries.buildDownloadUrl(target, credential));
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
