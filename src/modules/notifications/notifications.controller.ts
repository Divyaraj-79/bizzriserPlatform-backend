import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── Superadmin Endpoints ─────────────────────────────────────────────

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() createNotificationDto: any, @Request() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    return this.notificationsService.create(createNotificationDto, userId);
  }

  @Get('admin')
  @Roles('SUPER_ADMIN')
  findAllAdmin() {
    return this.notificationsService.findAllAdmin();
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }

  // ─── Client Endpoints ──────────────────────────────────────────────────

  @Get()
  findAllForUser(@Request() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    const userCreatedAt = req.user?.createdAt ? new Date(req.user.createdAt) : new Date(0);
    return this.notificationsService.findAllForUser(userId, userCreatedAt);
  }

  @Post(':id/read')
  markAsRead(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    return this.notificationsService.markAsRead(id, userId);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    return this.notificationsService.dismiss(id, userId);
  }
}
