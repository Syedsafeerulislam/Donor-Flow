import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly supabase: SupabaseService) {}

  // Helper to safely extract a valid organization ID
  private assertOrg(orgId: number | null): number {
    if (!orgId) {
      throw new ForbiddenException(
        'Settings require an organization context. Please login as an Organization Admin.',
      );
    }
    return orgId;
  }

  async getOrganizationSettings(orgId: number | null) {
    const validOrgId = this.assertOrg(orgId);

    const { data, error } = await this.supabase
      .getClient()
      .from('Organization')
      .select('*, paymentConfigs:PaymentConfig(*)')
      .eq('id', validOrgId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException('Organization not found');
    }

    return data;
  }

  async updateBranding(orgId: number | null, dto: UpdateBrandingDto) {
    const validOrgId = this.assertOrg(orgId);

    const { data, error } = await this.supabase
      .getClient()
      .from('Organization')
      .update({
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        logoUrl: dto.logoUrl,
        registrationNo: dto.registrationNo,
      })
      .eq('id', validOrgId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async updatePaymentConfig(orgId: number | null, provider: string, data: any) {
    const validOrgId = this.assertOrg(orgId);

    const { data: config, error } = await this.supabase
      .getClient()
      .from('PaymentConfig')
      .upsert(
        {
          organizationId: validOrgId,
          provider,
          merchantId: data.merchantId,
          apiKey: data.apiKey,
          isLiveMode: data.isLiveMode,
        },
        { onConflict: 'organizationId,provider' },
      )
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return config;
  }
}
