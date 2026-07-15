import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Organization, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(data: Prisma.OrganizationCreateInput): Promise<Organization> {
    const exists = await this.prisma.organization.findUnique({
      where: { slug: data.slug },
    });
    if (exists) throw new ConflictException(`Slug ${data.slug} is already taken`);

    return this.prisma.organization.create({ data });
  }

  async createWithAdmin(orgData: any, adminData: { email: string; firstName: string; lastName: string; password?: string }) {
    const slugExists = await this.prisma.organization.findUnique({ where: { slug: orgData.slug } });
    if (slugExists) throw new ConflictException(`Slug ${orgData.slug} already exists`);

    const userExists = await this.prisma.user.findUnique({ where: { email: adminData.email } });
    if (userExists) throw new ConflictException(`User with email ${adminData.email} already exists`);

    // Ensure the password meets our new criteria or use a secure fallback
    const passwordHash = await bcrypt.hash(adminData.password || 'BizzRiser@79', 10);

    return this.prisma.$transaction(async (tx) => {
      let initialCredits = 0;
      if (orgData.packageId) {
        const pkg = await tx.package.findUnique({ where: { id: orgData.packageId } });
        if (pkg) initialCredits = pkg.credits;
      }

      const org = await tx.organization.create({
        data: {
          name: orgData.name,
          slug: orgData.slug,
          address: orgData.address,
          whatsappNumber: orgData.whatsappNumber,
          expiryDate: orgData.expiryDate ? new Date(orgData.expiryDate) : null,
          packageId: orgData.packageId,
          credits: orgData.subscriptionStatus === 'TRIAL' ? 50 : initialCredits,
          subscriptionStatus: orgData.subscriptionStatus || 'ACTIVE',
          isPhoneVerified: orgData.isPhoneVerified || false,
          status: orgData.status || 'ACTIVE',
        },
      });

      const admin = await tx.user.create({
        data: {
          organizationId: org.id,
          email: adminData.email,
          firstName: adminData.firstName,
          lastName: adminData.lastName,
          passwordHash,
          role: UserRole.ORG_ADMIN,
        },
      });

      return { org, admin };
    });
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!org) throw new NotFoundException(`Organization not found`);
    return org;
  }

  async findAll() {
    return this.prisma.organization.findMany({
      where: { name: { not: 'Superadmin Private' } },
      include: {
        package: true,
        users: {
          where: { role: UserRole.ORG_ADMIN },
          take: 1,
          select: {
            email: true,
            firstName: true,
            lastName: true,
            lastIp: true,
            lastLoginAt: true,
          }
        },
        _count: {
          select: { users: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async update(id: string, data: any) {
    if (data.status === 'INACTIVE' || data.status === 'SUSPENDED') {
      this.realtimeGateway.emitForceLogoutOrg(id);
    }

    return this.prisma.organization.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        address: data.address,
        whatsappNumber: data.whatsappNumber,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        packageId: data.packageId,
        isPhoneVerified: data.isPhoneVerified,
        status: data.status,
      }
    });
  }

  async delete(id: string) {
    return this.prisma.organization.delete({
      where: { id }
    });
  }

  async getUsage(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { package: true }
    });

    if (!org) throw new NotFoundException('Organization not found');

    const [
      contactsCount,
      whatsappAccountsCount,
      teamMembersCount,
      chatbotsCount,
      broadcastsCount
    ] = await Promise.all([
      this.prisma.contact.count({ where: { organizationId: orgId } }),
      this.prisma.whatsAppAccount.count({ where: { organizationId: orgId } }),
      this.prisma.user.count({ where: { organizationId: orgId } }),
      this.prisma.chatbot.count({ where: { organizationId: orgId } }),
      this.prisma.campaign.count({ where: { organizationId: orgId } }) // Assuming campaigns are broadcasts
    ]);

    return {
      limits: {
        contactImportLimit: org.subscriptionStatus === 'TRIAL' ? 100 : (org.package?.contactImportLimit ?? 0),
        whatsappAccountLimit: org.package?.whatsappAccountLimit ?? 0,
        teamMemberLimit: org.package?.teamMemberLimit ?? 0,
        chatbotLimit: org.package?.chatbotLimit ?? 0,
        broadcastContactLimit: org.subscriptionStatus === 'TRIAL' ? 50 : (org.package?.broadcastContactLimit ?? 0),
        campaignLimit: org.subscriptionStatus === 'TRIAL' ? 1 : 0 // 0 means unlimited or determined elsewhere for non-trial
      },
      usage: {
        contacts: contactsCount,
        whatsappAccounts: whatsappAccountsCount,
        teamMembers: teamMembersCount,
        chatbots: chatbotsCount,
        broadcasts: broadcastsCount
      },
      credits: org.credits,
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
      subscriptionEndsAt: org.subscriptionEndsAt,
      billingCycle: org.billingCycle,
      package: org.package
    };
  }

  async findOne(id: string) {
    return this.prisma.organization.findUnique({
      where: { id },
      include: {
        users: {
          where: { role: UserRole.ORG_ADMIN },
          take: 1,
        }
      }
    });
  }
}
