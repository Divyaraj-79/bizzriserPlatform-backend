import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async findAllByOrganization(organizationId: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { organizationId },
    });
  }

  async create(data: any): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password || 'password123', 10);
    const { password, ...userData } = data;
    return this.prisma.user.create({
      data: {
        ...userData,
        passwordHash,
      },
    });
  }

  async remove(id: string, organizationId: string): Promise<User> {
    // Ensure the user belongs to the organization
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!user) throw new NotFoundException('User not found in this organization');

    return this.prisma.user.delete({
      where: { id },
    });
  }

  async updateRole(id: string, organizationId: string, role: UserRole): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!user) throw new NotFoundException('User not found in this organization');

    return this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }
}
