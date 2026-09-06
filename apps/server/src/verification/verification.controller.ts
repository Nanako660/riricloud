import { Body, Controller, Headers, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalAuth } from '../auth/optional-auth.decorator';
import { Public } from '../auth/public.decorator';
import { resolveClientIp } from '../common/auth-security';
import { SendCodeDto } from './dto/send-code.dto';
import { VerificationService } from './verification.service';

@ApiTags('verification')
@ApiBearerAuth()
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Public()
  @OptionalAuth()
  @Post('send-code')
  sendCode(
    @Body() dto: SendCodeDto,
    @CurrentUser() user: { id: string } | undefined,
    @Ip() remoteIp: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') forwardedFor?: string
  ) {
    return this.verificationService.sendCode(dto, user?.id, resolveClientIp(remoteIp, forwardedFor), userAgent);
  }
}
