import { Controller, Get, Post, Body, UseGuards, Req, Param, Patch, Delete } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async findAll() {
    return this.clientsService.findAll();
  }

  @Post('onboard')
  async onboard(@Body() data: any) {
    return this.clientsService.onboard(data);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.clientsService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.clientsService.delete(id);
  }

  @Post(':id/login-as')
  async loginAs(@Param('id') id: string, @Req() req: any) {
    return this.clientsService.loginAsClient(id, req.user);
  }
}
