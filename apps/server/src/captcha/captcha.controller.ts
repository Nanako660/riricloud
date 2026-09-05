import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { CaptchaService } from './captcha.service';

@ApiTags('captcha')
@Public()
@Controller('captcha')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Get('local')
  getLocal() {
    return this.captchaService.createLocalChallenge();
  }
}
