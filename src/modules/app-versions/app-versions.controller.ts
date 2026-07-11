import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AppVersionsService } from './app-versions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('app-versions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppVersionsController {
  constructor(private readonly appVersionsService: AppVersionsService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() createDto: any) {
    return this.appVersionsService.create(createDto);
  }

  @Get()
  findAll() {
    return this.appVersionsService.findAll();
  }

  @Get('latest')
  findLatest(@Request() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    return this.appVersionsService.findLatestPublished(userId);
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    return this.appVersionsService.acknowledge(userId, id);
  }
}
