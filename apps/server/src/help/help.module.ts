import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { AdminHelpController } from './admin-help.controller';
import { HelpController } from './help.controller';
import { HelpService } from './help.service';

@Module({
  imports: [PrismaModule, SystemModule],
  controllers: [HelpController, AdminHelpController],
  providers: [HelpService],
  exports: [HelpService]
})
export class HelpModule {}
