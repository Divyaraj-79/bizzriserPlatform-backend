import { PrismaService } from '../../prisma/prisma.service';
import { User, Prisma, UserRole } from '@prisma/client';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findOne(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    update(id: string, data: Prisma.UserUpdateInput): Promise<User>;
    findAllByOrganization(organizationId: string): Promise<User[]>;
    create(data: any): Promise<User>;
    remove(id: string, organizationId: string): Promise<User>;
    updateRole(id: string, organizationId: string, role: UserRole): Promise<User>;
}
