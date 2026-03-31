import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Organization, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.OrganizationCreateInput): Promise<Organization> {
    const exists = await this.prisma.organization.findUnique({
      where: { slug: data.slug },
    });
    if (exists) throw new ConflictException(`Slug ${data.slug} is already taken`);

    return this.prisma.organization.create({ data });
  }

  async createWithAdmin(orgData: { name: string; slug: string }, adminData: { email: string; firstName: string; lastName: string; password?: string }) {
    const slugExists = await this.prisma.organization.findUnique({ where: { slug: orgData.slug } });
    if (slugExists) throw new ConflictException(`Slug ${orgData.slug} already exists`);

    const userExists = await this.prisma.user.findUnique({ where: { email: adminData.email } });
    if (userExists) throw new ConflictException(`User with email ${adminData.email} already exists`);

    const passwordHash = await bcrypt.hash(adminData.password || 'BizzRiser@2026', 10);

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: orgData.name,
          slug: orgData.slug,
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
      include: {
        _count: {
          select: { users: true }
        }
      }
    });
  }

  async findOne(id: string) {
    return this.findById(id);
  }
}
