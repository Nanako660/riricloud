import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { PreviewTemplateDto } from './dto/preview-template.dto';
import { TemplatesService } from './templates.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/subscription-templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list() {
    return this.templatesService.list();
  }

  @Get('default')
  getDefault() {
    return this.templatesService.getDefault();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.get(id);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Post('preview')
  @ApiBody({ type: PreviewTemplateDto })
  preview(@Body() dto: PreviewTemplateDto) {
    return this.templatesService.previewTemplate(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.duplicate(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.remove(id);
  }
}
