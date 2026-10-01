import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class ClientsController {
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}