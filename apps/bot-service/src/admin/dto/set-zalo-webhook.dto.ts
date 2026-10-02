import { IsUrl } from 'class-validator';

export class SetZaloWebhookDto {
  @IsUrl({
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  public readonly url!: string;
}
