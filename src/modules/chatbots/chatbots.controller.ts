import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatbotsService } from './chatbots.service';
import { CreateChatbotDto } from './dto/create-chatbot.dto';
import { UpdateChatbotDto } from './dto/update-chatbot.dto';
import { TestRequestDto } from './dto/test-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('chatbots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatbotsController {
  constructor(private readonly chatbotsService: ChatbotsService) {}

  @Get()
  @Permissions('chatbots:view')
  findAll(@Req() req: any) {
    return this.chatbotsService.findAll(req.user.orgId);
  }

  @Post()
  @Permissions('chatbots:create')
  create(@Req() req: any, @Body() dto: CreateChatbotDto) {
    return this.chatbotsService.create(req.user.orgId, dto);
  }

  @Get(':id')
  @Permissions('chatbots:view')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.findOne(req.user.orgId, id);
  }

  @Patch(':id')
  @Permissions('chatbots:edit')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateChatbotDto) {
    return this.chatbotsService.update(req.user.orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permissions('chatbots:delete')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.remove(req.user.orgId, id);
  }

  @Post(':id/activate')
  @Permissions('chatbots:edit')
  activate(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.activate(req.user.orgId, id);
  }

  @Post(':id/deactivate')
  @Permissions('chatbots:edit')
  deactivate(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.deactivate(req.user.orgId, id);
  }

  @Post(':id/clone')
  @Permissions('chatbots:create')
  clone(@Req() req: any, @Param('id') id: string) {
    return this.chatbotsService.clone(req.user.orgId, id);
  }

  @Post('test-request')
  @Permissions('chatbots:edit')
  testRequest(@Body() dto: TestRequestDto) {
    return this.chatbotsService.executeTestRequest(dto);
  }
}
