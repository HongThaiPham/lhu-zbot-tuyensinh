import { Injectable, TooManyRequestsException } from '@nestjs/common';

interface AttemptEntry {
  readonly expiresAt: number;
  readonly count: number;
}

@Injectable()
export class LoginAbuseService {
  private readonly attempts = new Map<string, AttemptEntry>();

  public checkAllowed(key: string, now = Date.now()): void {
    this.prune(now);
    const entry = this.attempts.get(key);
    if (!entry) {
      return;
    }

    throw new TooManyRequestsException('Too many login attempts. Please try again later.');
  }

  public recordFailure(key: string, windowSeconds: number, maxAttempts: number, now = Date.now()): void {
    const entry = this.attempts.get(key);
    const expiresAt = now + windowSeconds * 1000;

    if (!entry || entry.expiresAt < now) {
      if (maxAttempts <= 1) {
        this.attempts.set(key, { count: 1, expiresAt });
      } else {
        this.attempts.delete(key);
      }
      return;
    }

    const nextCount = entry.count + 1;
    if (nextCount >= maxAttempts) {
      this.attempts.set(key, {
        count: nextCount,
        expiresAt,
      });
      return;
    }

    this.attempts.set(key, {
      count: nextCount,
      expiresAt,
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
