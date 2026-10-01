import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  public async hashPassword(plainTextPassword: string): Promise<string> {
    return await argon2.hash(plainTextPassword, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  public async verifyPassword(passwordHash: string, plainTextPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainTextPassword);
    } catch {
      return false;
    }
  }
}
