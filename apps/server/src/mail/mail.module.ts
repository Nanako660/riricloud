import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';

@Module({
  imports: [SystemModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}
