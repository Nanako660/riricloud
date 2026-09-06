import { Module } from '@nestjs/common';
import { CaptchaModule } from '../captcha/captcha.module';
import { MailModule } from '../mail/mail.module';
import { SystemModule } from '../system/system.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [SystemModule, MailModule, CaptchaModule, SystemLogsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService]
})
export class VerificationModule {}
