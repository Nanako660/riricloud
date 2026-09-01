import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { SettingsService } from './settings.service';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly systemService: SystemService,
    private readonly settingsService: SettingsService
  ) {}

  // 统一版本号只读端点（见 docs/VERSIONING.md §3）
  @Public()
  @Get('version')
  getVersion() {
    return this.systemService.getVersion();
  }

  // 登录页和前端外壳公开信息：仅返回品牌、公告、客服和订阅基准地址。
  @Public()
  @Get('public-info')
  async getPublicInfo() {
    return this.settingsService.getPublicSettings();
  }
}
