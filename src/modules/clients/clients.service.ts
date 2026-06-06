import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async findAll() {
    return this.prisma.organization.findMany({
      where: {
        NOT: {
          slug: 'super-admin'
        }
      },
      include: {
        users: {
          where: { role: UserRole.ORG_ADMIN },
          take: 1,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
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

  async onboard(data: any) {
    const { organization, admin } = data;

    const slugExists = await this.prisma.organization.findUnique({ where: { slug: organization.slug } });
    if (slugExists) throw new ConflictException(`Slug ${organization.slug} already exists`);

    const userExists = await this.prisma.user.findUnique({ where: { email: admin.email } });
    if (userExists) throw new ConflictException(`User with email ${admin.email} already exists`);

    const passwordHash = await bcrypt.hash(admin.password || 'BizzRiser@123', 10);

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: organization.name,
          slug: organization.slug,
          expiryDate: organization.expiryDate ? new Date(organization.expiryDate) : null,
          package: organization.package || 'FREE',
          status: 'ACTIVE',
          metadata: organization.permissions ? { permissions: organization.permissions } : {}
        },
      });

      const user = await tx.user.create({
        data: {
          email: admin.email,
          passwordHash,
          firstName: admin.firstName || '',
          lastName: admin.lastName || '',
          role: UserRole.ORG_ADMIN,
          organizationId: org.id,
        }
      });

      return { organization: org, admin: user };
    });
  }

  async update(id: string, data: any) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization with ID ${id} not found`);

    return this.prisma.organization.update({
      where: { id },
      data: {
        name: data.organization?.name,
        slug: data.organization?.slug,
        expiryDate: data.organization?.expiryDate ? new Date(data.organization?.expiryDate) : undefined,
        package: data.organization?.package,
        status: data.organization?.status,
        metadata: data.organization?.permissions ? { permissions: data.organization?.permissions } : undefined
      }
    });
  }

  async delete(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization with ID ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      await tx.user.deleteMany({ where: { organizationId: id } });
      return tx.organization.delete({ where: { id } });
    });
  }

  async loginAsClient(id: string, currentUser: any) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization with ID ${id} not found`);

    const adminUser = await this.prisma.user.findFirst({
      where: { organizationId: id, role: UserRole.ORG_ADMIN }
    });
    if (!adminUser) throw new NotFoundException(`No admin user found for organization ${org.name}`);

    return this.authService.switchTenant({
      email: adminUser.email,
      sub: adminUser.id,
      orgId: adminUser.organizationId,
      role: adminUser.role,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      originalOrgId: currentUser.orgId || currentUser.organizationId
    }, id);
  }
}