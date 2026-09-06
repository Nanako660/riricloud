import { Controller, Get, Headers, Ip } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { resolveClientIp } from '../common/auth-security';
import { CaptchaService } from './captcha.service';

@ApiTags('captcha')
@Public()
@Controller('captcha')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Get('local')
  getLocal(@Ip() ip: string, @Headers('x-forwarded-for') forwardedFor?: string) {
    return this.captchaService.createLocalChallenge(resolveClientIp(ip, forwardedFor));
  }
}
