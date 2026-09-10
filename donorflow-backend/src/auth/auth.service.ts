import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../common/types/user-role.enum';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly supabase: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const slugBase = dto.orgName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const slug = `${slugBase}-${Date.now().toString().slice(-4)}`;

    const client = this.supabase.getClient();

    const { data: created, error: createError } = await client.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      throw new BadRequestException(createError?.message ?? 'Failed to create account');
    }

    const { error: rpcError } = await client.rpc('create_organization_with_admin', {
      p_org_name: dto.orgName,
      p_org_slug: slug,
      p_user_id: created.user.id,
      p_email: dto.email,
      p_name: dto.name,
    });

    if (rpcError) {
      // Compensate: the auth user was created but the org/profile insert failed.
      await client.auth.admin.deleteUser(created.user.id);
      throw new BadRequestException(rpcError.message);
    }

    return { message: 'Organization admin registered successfully' };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const client = this.supabase.createEphemeralClient();

    const { data, error } = await client.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in ?? 3600,
    };
  }

  async logout(accessToken: string | undefined): Promise<{ message: string }> {
    if (accessToken) {
      await this.supabase.getClient().auth.admin.signOut(accessToken);
    }
    return { message: 'Logged out successfully' };
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const { data, error } = await this.supabase.createEphemeralClient().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in ?? 3600,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    // Don't reveal whether the account exists either way.
    await this.supabase.getClient().auth.resetPasswordForEmail(dto.email, {
      redirectTo: `${frontendUrl}/reset-password`,
    });

    return { message: 'If an account exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const { data, error } = await this.supabase.createEphemeralClient().auth.verifyOtp({
      token_hash: dto.token,
      type: 'recovery',
    });

    if (error || !data.user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const { error: updateError } = await this.supabase.getClient().auth.admin.updateUserById(data.user.id, {
      password: dto.newPassword,
    });

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }

    return { message: 'Password reset successful' };
  }

  async getProfile(userId: string): Promise<{ id: string; email: string; role: UserRole; organizationId: number | null }> {
    const user = await this.usersService.findById(userId);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
}
