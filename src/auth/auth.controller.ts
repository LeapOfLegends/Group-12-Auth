import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Admins and clients both log in here; the email domain picks the account type.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.readRefreshCookie(request) || dto?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  private setRefreshCookie(response: Response, token: string) {
    const configuredSeconds = Number(this.configService.get<string>('REFRESH_TOKEN_EXPIRATION'));
    const maxAgeSeconds = Number.isSafeInteger(configuredSeconds) && configuredSeconds > 0
      ? configuredSeconds
      : 30 * 24 * 60 * 60;
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie('refreshToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/auth',
      maxAge: maxAgeSeconds * 1000,
    });
  }

  private readRefreshCookie(request: Request) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;

    const cookie = cookieHeader.split(';').map((part) => part.trim())
      .find((part) => part.startsWith('refreshToken='));
    return cookie ? cookie.slice('refreshToken='.length) : undefined;
  }
}
