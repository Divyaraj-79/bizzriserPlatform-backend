import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContactNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, contactId: string) {
    return this.prisma.contactNote.findMany({
      where: { contactId, organizationId: orgId },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(orgId: string, contactId: string, userId: string, body: string) {
    return this.prisma.contactNote.create({
      data: {
        organizationId: orgId,
        contactId,
        userId,
        body,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async update(orgId: string, noteId: string, body: string) {
    const note = await this.prisma.contactNote.findUnique({ where: { id: noteId } });
    if (!note || note.organizationId !== orgId) {
      throw new NotFoundException('Note not found');
    }

    return this.prisma.contactNote.update({
      where: { id: noteId },
      data: { body },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async remove(orgId: string, noteId: string) {
    const note = await this.prisma.contactNote.findUnique({ where: { id: noteId } });
    if (!note || note.organizationId !== orgId) {
      throw new NotFoundException('Note not found');
    }

    return this.prisma.contactNote.delete({ where: { id: noteId } });
  }
}
