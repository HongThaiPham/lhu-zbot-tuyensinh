import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface AttemptEntry {
  readonly expiresAt: number;
  readonly count: number;
  readonly limit: number;
}

@Injectable()
export class LoginAbuseService {
  private readonly attempts = new Map<string, AttemptEntry>();

  public checkAllowed(key: string, now = Date.now()): void {
    this.prune(now);
    const entry = this.attempts.get(key);
    if (!entry || entry.expiresAt < now) {
      return;
    }

    if (entry.count >= entry.limit) {
      throw new HttpException('Too many login attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  public recordFailure(key: string, windowSeconds: number, maxAttempts: number, now = Date.now()): void {
    const entry = this.attempts.get(key) ?? null;
    const expiresAt = now + windowSeconds * 1000;
    const currentCount = !entry || entry.expiresAt < now ? 0 : entry.count;
    const nextCount = currentCount + 1;

    this.attempts.set(key, {
      count: nextCount,
      expiresAt,
      limit: maxAttempts,
    });
  }

  public clear(key: string): void {
    this.attempts.delete(key);
  }

  private prune(now: number): void {
    for (const [key, value] of this.attempts.entries()) {
      if (value.expiresAt < now) {
        this.attempts.delete(key);
      }
    }
  }
}
