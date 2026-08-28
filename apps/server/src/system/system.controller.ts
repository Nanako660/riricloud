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

  // 登录页公开信息：站点名与注册开关（不含任何敏感设置）
  @Public()
  @Get('public-info')
  async getPublicInfo() {
    const settings = await this.settingsService.getSettings();
    return { siteName: settings.siteName, registrationEnabled: settings.registrationEnabled };
  }
}
