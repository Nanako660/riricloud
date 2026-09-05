import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { TestSmtpDto } from './dto/test-smtp.dto';
import { MailService } from './mail.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/settings/smtp')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  test(@Body() dto: TestSmtpDto) {
    return this.mailService.testSmtp(dto.email);
  }
}
