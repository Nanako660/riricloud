import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { defaultUserNickname, generateUniqueUserUid, isUidUniqueConstraintError } from './user-identity';

@Injectable()
export class UserIdentityService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { OR: [{ uid: null }, { nickname: null }] },
      select: { id: true, uid: true, nickname: true }
    });
    for (const user of users) {
      let uid = user.uid;
      if (uid === null) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          try {
            uid = await generateUniqueUserUid(this.prisma.user);
            break;
          } catch (error) {
            if (!isUidUniqueConstraintError(error) || attempt === 7) throw error;
          }
        }
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(user.uid === null ? { uid } : {}),
          ...(user.nickname === null ? { nickname: defaultUserNickname(uid) } : {})
        }
      });
    }
  }
}
