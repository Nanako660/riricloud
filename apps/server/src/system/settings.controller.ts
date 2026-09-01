import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { SettingsService } from './settings.service';
import { ResetSettingsDto, UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Post('reset')
  resetSettings(@Body() dto: ResetSettingsDto) {
    return this.settingsService.resetToDefaults(dto.keys);
  }
}
