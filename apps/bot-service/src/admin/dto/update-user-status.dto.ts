import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @IsBoolean()
  public active!: boolean;
}
