import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  // 统一版本号只读端点（见 docs/VERSIONING.md §3）
  @Public()
  @Get('version')
  getVersion() {
    return this.systemService.getVersion();
  }
}
