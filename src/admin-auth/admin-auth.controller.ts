import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { LoginAdminDto } from './dto/login-admin.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { SuperAdminGuard } from './super-admin.guard';

@Controller('api/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // Only a logged-in super admin can register admins (super_admin, operations or finance).
  @Post('register')
  @UseGuards(SuperAdminGuard)
  async register(@Body() dto: RegisterAdminDto) {
    return this.adminAuthService.register(dto);
  }

  // Any active admin can log in.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginAdminDto) {
    return this.adminAuthService.login(dto);
  }
}
