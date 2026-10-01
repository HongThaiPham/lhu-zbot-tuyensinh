import { loadBotServiceConfig, type BotServiceConfig } from '@lhu/config';

export const BOT_SERVICE_CONFIG = Symbol('BOT_SERVICE_CONFIG');

export function loadAuthConfig(): BotServiceConfig {
  return loadBotServiceConfig(process.env);
}
