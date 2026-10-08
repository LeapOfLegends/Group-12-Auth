import { Body, Controller, Post, HttpCode, HttpStatus, Patch, Delete, Get, Param } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminsService } from './admins.service';
import { LoginAdminDto } from './dto/login-admin.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';

@Controller('api/auth')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminsService: AdminsService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginAdminDto) {
    return this.adminService.login(dto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterAdminDto) {
    return this.adminService.register(dto);
  }

  @Get('admins')
  async getAllAdmins() {
    const admins = await this.adminsService.findAll();
    return admins.map((admin) => this.adminsService.toPublicAdmin(admin));
  }

  @Patch('admin/:adminId/role')
  async updateAdminRole(@Param('adminId') adminId: string, @Body() dto: UpdateAdminRoleDto) {
    const admin = await this.adminsService.updateRole(adminId, dto.role);
    return this.adminsService.toPublicAdmin(admin);
  }

  @Delete('admin/:adminId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAdmin(@Param('adminId') adminId: string) {
    await this.adminsService.deleteAdmin(adminId);
  }
}
