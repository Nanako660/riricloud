import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { CreateHelpArticleDto, QueryHelpArticlesDto, UpdateHelpArticleDto } from './dto/help.dto';
import { HelpService } from './help.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/help/articles')
export class AdminHelpController {
  constructor(private readonly helpService: HelpService) {}

  @Get()
  list(@Query() query: QueryHelpArticlesDto) {
    return this.helpService.listAllForAdmin(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.helpService.getForAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateHelpArticleDto) {
    return this.helpService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHelpArticleDto) {
    return this.helpService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.helpService.remove(id);
  }

  @Post('reset-defaults')
  resetDefaults() {
    return this.helpService.resetDefaults();
  }
}
