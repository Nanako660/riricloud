import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { CreateMirrorSiteDto, ListMirrorSitesDto, UpdateMirrorSiteDto } from './dto/mirror-site.dto';
import { MirrorService } from './mirror.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/mirrors')
export class MirrorsController {
  constructor(private readonly mirrors: MirrorService) {}

  @Get()
  list(@Query() query: ListMirrorSitesDto) { return this.mirrors.list(query.page, query.pageSize); }

  @Get(':id')
  detail(@Param('id') id: string) { return this.mirrors.detail(id); }

  @Post()
  create(@Body() dto: CreateMirrorSiteDto) { return this.mirrors.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMirrorSiteDto) { return this.mirrors.update(id, dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.mirrors.remove(id); }

  @Post(':id/rotate-share-token')
  rotateShareToken(@Param('id') id: string) { return this.mirrors.rotateShareToken(id); }

  @Post(':id/test')
  test(@Param('id') id: string) { return this.mirrors.test(id); }
}
