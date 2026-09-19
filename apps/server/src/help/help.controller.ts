import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { QueryHelpArticlesDto } from './dto/help.dto';
import { HelpService } from './help.service';

@ApiTags('help')
@ApiBearerAuth()
@Controller('help/articles')
export class HelpController {
  constructor(private readonly helpService: HelpService) {}

  @Get()
  list(@Query() query: QueryHelpArticlesDto) {
    return this.helpService.listPublished(query);
  }

  @Get(':idOrSlug')
  getOne(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.helpService.getPublishedArticle(idOrSlug, user?.id);
  }
}
