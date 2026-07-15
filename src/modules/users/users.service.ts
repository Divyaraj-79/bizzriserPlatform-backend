import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { ActivityLoggerService } from '../activity-logs/activity-logger.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly realtimeGateway: RealtimeGateway,
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
        },
        organization: true
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
    if (data.status !== undefined) {
      updateData.status = data.status as any;
      if (data.status === 'INACTIVE' || data.status === 'SUSPENDED') {
        this.realtimeGateway.emitForceLogoutUser(id);
      }
    }
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

  // --- MY ACCOUNT METHODS ---

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          include: {
            package: true
          }
        }
      }
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async updateMe(userId: string, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.address !== undefined && user.role === 'ORG_ADMIN') {
      await this.prisma.organization.update({
        where: { id: user.organizationId },
        data: { address: data.address }
      });
    }

    if (data.preferences) {
      const currentPerms = (user.permissions as Record<string, any>) || {};
      updateData.permissions = { ...currentPerms, preferences: data.preferences };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData
    });
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) throw new Error('Incorrect current password');

    const passwordHash = await bcrypt.hash(newPass, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
    return { success: true };
  }

  async uploadMyAvatar(userId: string, file: any) {
    const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: base64 },
    });
    return { avatarUrl: updated.avatarUrl };
  }

  async deleteMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Guard: Prevent sole ORG_ADMIN from deleting account
    if (user.role === 'ORG_ADMIN') {
      const adminCount = await this.prisma.user.count({
        where: {
          organizationId: user.organizationId,
          role: 'ORG_ADMIN',
          status: 'ACTIVE'
        }
      });
      if (adminCount <= 1) {
        throw new Error('You are the sole admin of your organization. Please transfer ownership or contact support to delete your account.');
      }
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }
}
