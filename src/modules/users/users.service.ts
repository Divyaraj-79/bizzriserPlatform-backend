import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { ActivityLoggerService } from '../activity-logs/activity-logger.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: ActivityLoggerService,
  ) {}

  async findOne(id: string): Promise<any | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        accountAccess: {
          include: {
            whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
          }
        }
      },
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<any | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        accountAccess: {
          include: {
            whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true } }
          }
        }
      },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async findAllByOrganization(organizationId: string): Promise<any[]> {
    return this.prisma.user.findMany({
      where: { organizationId },
      include: {
        accountAccess: {
          include: {
            whatsappAccount: { select: { id: true, displayName: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: any): Promise<User> {
    const { password, accountAssignments, ...userData } = data;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: userData.email,
        passwordHash,
        firstName: userData.firstName,
        lastName: userData.lastName || '',
        role: userData.role || 'AGENT',
        organization: { connect: { id: userData.organizationId } },
        status: userData.status || 'ACTIVE',
        timezone: userData.timezone || 'UTC',
        permissions: userData.permissions || {},
        accountAccess: {
          create: accountAssignments?.map((a: any) => ({
            whatsappAccountId: a.whatsappAccountId
          })) || []
        }
      },
    });

    await this.activityLogger.log(
      userData.organizationId,
      'member_created',
      { email: userData.email, role: userData.role || 'AGENT' }
    );

    return user;
  }

  async updateUser(id: string, organizationId: string, data: { accountAssignments?: any[]; status?: string; firstName?: string; lastName?: string; permissions?: any; timezone?: string }): Promise<any> {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found in this organization');

    const updateData: Prisma.UserUncheckedUpdateInput = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.status !== undefined) updateData.status = data.status as any;
    if (data.permissions !== undefined) updateData.permissions = data.permissions;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;

    if (data.accountAssignments) {
      await this.prisma.whatsAppAccountAccess.deleteMany({ where: { userId: id } });
      updateData.accountAccess = {
        create: data.accountAssignments.map((a: any) => ({
          whatsappAccountId: a.whatsappAccountId
        }))
      };
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      include: { 
        accountAccess: true 
      },
    });
  }


  async remove(id: string, organizationId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found in this organization');
    
    const deletedUser = await this.prisma.user.delete({ where: { id } });
    
    await this.activityLogger.log(
      organizationId,
      'member_removed',
      { email: user.email, userId: id }
    );
    
    return deletedUser;
  }

  async updateRole(id: string, organizationId: string, role: UserRole): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found in this organization');
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async getAccountAccess(userId: string, whatsappAccountId: string) {
    return this.prisma.whatsAppAccountAccess.findUnique({
      where: {
        userId_whatsappAccountId: {
          userId,
          whatsappAccountId,
        },
      }
    });
  }
}
