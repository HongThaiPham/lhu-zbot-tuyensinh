import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  public email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  public password!: string;
}
