import { Body, Controller, Get, Headers, Param, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { ImportBinaryDto } from './dto/import-binary.dto';
import { BinariesService } from './binaries.service';
import { BinaryResourcesService } from './binary-resources.service';
import { BinaryResourceImportDto, BinaryResourceUploadDto } from './dto/binary-resource.dto';

@ApiTags('binaries')
@Controller()
export class BinariesController {
  constructor(
    private readonly binaries: BinariesService,
    private readonly resources?: BinaryResourcesService
  ) {}

  @Public()
  @Get('downloads/agent')
  async downloadAgent(
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-agent-token') headerToken: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.binaries.authorizeDownload(headerToken);
    const target = this.binaries.resolveAgentTarget(userAgent);
    const asset = this.binaries.getAsset(target);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', asset.size);
    response.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(createReadStream(asset.path));
  }

  @Public()
  @Get('downloads/binaries/:target')
  async download(
    @Param('target') target: string,
    @Headers('x-agent-token') headerToken: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.binaries.authorizeDownload(headerToken);
    const asset = this.binaries.getAsset(target);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', asset.size);
    response.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(createReadStream(asset.path));
  }

  @Public()
  @Get('downloads/binary-assets/:id')
  async downloadManagedAsset(
    @Param('id') id: string,
    @Headers('x-agent-token') headerToken: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.binaries.authorizeDownload(headerToken);
    const managed = await this.resources!.getDownloadAsset(id);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', managed.file?.size ?? managed.asset.size);
    response.setHeader('Content-Disposition', `attachment; filename="${managed.file?.name ?? managed.asset.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(createReadStream(managed.path));
  }

  @Public()
  @Get('downloads/binary-files/:id')
  async downloadManagedFile(
    @Param('id') id: string,
    @Headers('x-agent-token') headerToken: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.binaries.authorizeDownload(headerToken);
    const managed = await this.resources!.getDownloadFile(id);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', managed.file.size);
    response.setHeader('Content-Disposition', `attachment; filename="${managed.file.name}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(createReadStream(managed.path));
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

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/binary-resources')
  listResources() {
    return this.resources!.list();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/binary-resources/:id/deployments')
  resourceDeployments(@Param('id') id: string) {
    return this.resources!.deployments(id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/binary-resources/:id')
  resourceDetail(@Param('id') id: string) {
    return this.resources!.detail(id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/binary-resources/import')
  importResource(@Body() dto: BinaryResourceImportDto, @CurrentUser() user: { id: string }) {
    return this.resources!.importRemote(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/binary-resources/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  uploadResource(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Body() dto: BinaryResourceUploadDto,
    @CurrentUser() user: { id: string }
  ) {
    if (!file?.buffer) throw new Error('binary file is required');
    return this.resources!.upload(dto, file.buffer, user.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/binary-resources/:id/activate')
  activateResource(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.resources!.activate(id, user.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/binary-resources/:id/disable')
  disableResource(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.resources!.disable(id, user.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/binary-resources/:id/retire')
  retireResource(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.resources!.retire(id, user.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/binary-resources/:id/default')
  setDefaultResource(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.resources!.setDefault(id, user.id);
  }
}
