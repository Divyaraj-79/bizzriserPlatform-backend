import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { SequencesService } from './sequences.service';
import { CreateSequenceDto, UpdateSequenceDto, CreateSequenceStepDto } from './dto/sequences.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('sequences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SequencesController {
  constructor(private readonly sequencesService: SequencesService) {}

  @Get()
  @Permissions('sequences:view')
  async getSequences(@Req() req: any) {
    return this.sequencesService.getSequences(req.user.organizationId);
  }

  @Get(':id')
  @Permissions('sequences:view')
  async getSequence(@Req() req: any, @Param('id') id: string) {
    return this.sequencesService.getSequence(req.user.organizationId, id);
  }

  @Post()
  @Permissions('sequences:create')
  async createSequence(@Req() req: any, @Body() data: CreateSequenceDto) {
    return this.sequencesService.createSequence(req.user.organizationId, data);
  }

  @Patch(':id')
  @Permissions('sequences:edit')
  async updateSequence(@Req() req: any, @Param('id') id: string, @Body() data: UpdateSequenceDto) {
    return this.sequencesService.updateSequence(req.user.organizationId, id, data);
  }

  @Delete(':id')
  @Permissions('sequences:delete')
  async deleteSequence(@Req() req: any, @Param('id') id: string) {
    return this.sequencesService.deleteSequence(req.user.organizationId, id);
  }

  @Post(':id/steps')
  @Permissions('sequences:edit')
  async createStep(@Req() req: any, @Param('id') id: string, @Body() data: CreateSequenceStepDto) {
    return this.sequencesService.createStep(req.user.organizationId, id, data);
  }

  @Patch(':id/steps/:stepId')
  @Permissions('sequences:edit')
  async updateStep(
    @Req() req: any,
    @Param('id') sequenceId: string,
    @Param('stepId') stepId: string,
    @Body() data: Partial<CreateSequenceStepDto>,
  ) {
    return this.sequencesService.updateStep(req.user.organizationId, sequenceId, stepId, data);
  }

  @Delete(':id/steps/:stepId')
  @Permissions('sequences:edit')
  async deleteStep(@Req() req: any, @Param('id') sequenceId: string, @Param('stepId') stepId: string) {
    return this.sequencesService.deleteStep(req.user.organizationId, sequenceId, stepId);
  }

  @Post(':id/enroll')
  @Permissions('sequences:edit')
  async enrollContact(
    @Req() req: any,
    @Param('id') sequenceId: string,
    @Body('contactId') contactId: string,
    @Body('accountId') accountId: string,
  ) {
    return this.sequencesService.enrollContact(req.user.organizationId, sequenceId, contactId, accountId);
  }
}
