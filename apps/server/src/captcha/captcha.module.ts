import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { CaptchaController } from './captcha.controller';
import { CaptchaService } from './captcha.service';

@Module({
  imports: [SystemModule, SystemLogsModule],
  controllers: [CaptchaController],
  providers: [CaptchaService],
  exports: [CaptchaService]
})
export class CaptchaModule {}
