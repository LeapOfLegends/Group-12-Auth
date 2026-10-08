import { Controller, Get } from '@nestjs/common';

@Controller('admins')
export class AdminsController {
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}
