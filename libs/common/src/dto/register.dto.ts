import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/** Roles a user may pick for themselves at sign-up (ADMIN can never be self-assigned). */
export const SELF_ASSIGNABLE_ROLES = ['USER', 'ORGANIZER'] as const;
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export class RegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsOptional()
  @IsIn(SELF_ASSIGNABLE_ROLES, {
    message: 'Role must be USER or ORGANIZER',
  })
  role?: SelfAssignableRole;
}
