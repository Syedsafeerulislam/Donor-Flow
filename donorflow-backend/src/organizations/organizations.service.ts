import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization } from './organization.entity';

@Injectable()
export class OrganizationsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findById(organizationId: number | null): Promise<Organization> {
    if (!organizationId) {
      throw new NotFoundException('Organization not found for the current user');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('Organization')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Organization not found');
    }

    return data as Organization;
  }

  async update(organizationId: number | null, dto: UpdateOrganizationDto): Promise<Organization> {
    await this.findById(organizationId);

    const { data, error } = await this.supabase
      .getClient()
      .from('Organization')
      .update(dto)
      .eq('id', organizationId as number)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Organization;
  }
}
