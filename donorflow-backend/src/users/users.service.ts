import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { UserRole } from '../common/types/user-role.enum';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MailService } from '../mail/mail.service';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('User')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as User | null;
  }

  async findById(id: string): Promise<User> {
    const { data, error } = await this.supabase
      .getClient()
      .from('User')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException('User not found');
    }

    return data as User;
  }

  async createStaffMember(
    organizationId: number,
    dto: CreateStaffDto,
  ): Promise<{ user: User }> {
    const existingUser = await this.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const client = this.supabase.getClient();

    // Creates the Supabase Auth user and an invite link in one call.
    const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
      type: 'invite',
      email: dto.email,
      options: { data: { name: dto.name } },
    });

    if (linkError || !linkData?.user) {
      throw new BadRequestException(linkError?.message ?? 'Failed to create staff account');
    }

    const authUserId = linkData.user.id;

    const { error: rpcError } = await client.rpc('create_staff_profile', {
      p_user_id: authUserId,
      p_organization_id: organizationId,
      p_email: dto.email,
      p_name: dto.name,
      p_phone: dto.phone ?? null,
      p_role: dto.role ?? UserRole.STAFF,
    });

    if (rpcError) {
      await client.auth.admin.deleteUser(authUserId);
      throw new InternalServerErrorException(rpcError.message);
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const hashedToken = (linkData.properties as any)?.hashed_token;
    const inviteLink = `${frontendUrl}/reset-password?token=${hashedToken}`;

    try {
      await this.mailService.sendUserInvitation(dto.email, dto.name, inviteLink);
    } catch (emailError) {
      // Staff account is created either way; email delivery is best-effort.
    }

    const user = await this.findById(authUserId);
    return { user };
  }

  async findAllByOrganization(
    organizationId: number,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{
    data: User[];
    total: number;
    page: number;
    limit: number;
  }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .getClient()
      .from('User')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .order('createdAt', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      data: (data as User[]) ?? [],
      total: count ?? 0,
      page,
      limit,
    };
  }

  async updateUser(
    organizationId: number,
    userId: string,
    dto: UpdateUserDto,
  ): Promise<User> {
    const { data: existing, error: findError } = await this.supabase
      .getClient()
      .from('User')
      .select('*')
      .eq('id', userId)
      .eq('organizationId', organizationId)
      .maybeSingle();

    if (findError) {
      throw new InternalServerErrorException(findError.message);
    }
    if (!existing) {
      throw new NotFoundException('User not found or access denied');
    }

    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot assign SUPER_ADMIN role');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('User')
      .update({
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as User;
  }

  async deactivateUser(
    organizationId: number,
    userId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    if (userId === currentUserId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const { data: existing, error: findError } = await this.supabase
      .getClient()
      .from('User')
      .select('id')
      .eq('id', userId)
      .eq('organizationId', organizationId)
      .maybeSingle();

    if (findError) {
      throw new InternalServerErrorException(findError.message);
    }
    if (!existing) {
      throw new NotFoundException('User not found or access denied');
    }

    const { error } = await this.supabase
      .getClient()
      .from('User')
      .update({ isActive: false })
      .eq('id', userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { message: 'User deactivated successfully' };
  }

  async deleteUser(
    organizationId: number,
    userId: string,
    currentUserId: string,
  ): Promise<{ message: string }> {
    if (userId === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const { data: existing, error: findError } = await this.supabase
      .getClient()
      .from('User')
      .select('id')
      .eq('id', userId)
      .eq('organizationId', organizationId)
      .maybeSingle();

    if (findError) {
      throw new InternalServerErrorException(findError.message);
    }
    if (!existing) {
      throw new NotFoundException('User not found or access denied');
    }

    // Deletes the Supabase Auth user; the "User" profile row cascades via its FK.
    const { error } = await this.supabase.getClient().auth.admin.deleteUser(userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { message: 'User permanently deleted' };
  }
}
