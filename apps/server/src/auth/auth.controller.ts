import { Body, Controller, Get, Headers, HttpCode, Ip, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { clearAuthCookie, setAuthCookie } from './auth-cookie';
import { resolveClientIp } from '../common/auth-security';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string | undefined, @Headers('x-forwarded-for') forwardedFor: string | undefined, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto, resolveClientIp(ip, forwardedFor), userAgent);
    setAuthCookie(response, result.accessToken);
    return { authenticated: true };
  }

  // 注册（受系统设置注册开关控制，注册即登录）
  @Public()
  @HttpCode(201)
  @Post('register')
  async register(@Body() dto: RegisterDto, @Ip() ip: string, @Headers('user-agent') userAgent: string | undefined, @Headers('x-forwarded-for') forwardedFor: string | undefined, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(dto, resolveClientIp(ip, forwardedFor), userAgent);
    setAuthCookie(response, result.accessToken);
    return { authenticated: true };
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string, @Headers('user-agent') userAgent: string | undefined, @Headers('x-forwarded-for') forwardedFor: string | undefined) {
    return this.authService.resetPassword(dto, resolveClientIp(ip, forwardedFor), userAgent);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: { id: string }, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.authService.logout(user.id);
    clearAuthCookie(response);
  }

  @Get('me')
  async me(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }
}
