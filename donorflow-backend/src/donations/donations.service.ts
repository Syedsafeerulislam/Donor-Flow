import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CampaignStatus } from '../common/types/campaign-status.enum';
import { CreateDonationDto } from './dto/create-donation.dto';
import { PublicDonationDto } from './dto/public-donation.dto';

@Injectable()
export class DonationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private generateReceiptNumber(): string {
    return `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  async createInternal(organizationId: number, userId: string, dto: CreateDonationDto) {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const client = this.supabase.getClient();

    if (dto.campaignId) {
      const { data: campaign } = await client
        .from('Campaign')
        .select('id')
        .eq('id', dto.campaignId)
        .eq('organizationId', organizationId)
        .maybeSingle();
      if (!campaign) {
        throw new NotFoundException('Campaign not found or access denied');
      }
    }

    if (dto.donorId) {
      const { data: donor } = await client
        .from('Donor')
        .select('id')
        .eq('id', dto.donorId)
        .eq('organizationId', organizationId)
        .maybeSingle();
      if (!donor) {
        throw new NotFoundException('Donor not found or access denied');
      }
    }

    const receiptNumber = this.generateReceiptNumber();

    const { data, error } = await client.rpc('record_donation', {
      p_organization_id: organizationId,
      p_campaign_id: dto.campaignId ?? null,
      p_donor_id: dto.donorId ?? null,
      p_amount: dto.amount,
      p_currency: dto.currency || 'PKR',
      p_payment_method: dto.paymentMethod ?? null,
      p_payment_reference: dto.paymentReference ?? null,
      p_receipt_number: receiptNumber,
      p_notes: dto.notes ?? null,
      p_recorded_by_id: userId,
    });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Array.isArray(data) ? data[0] : data;
  }

  async createPublic(dto: PublicDonationDto) {
    const client = this.supabase.getClient();

    const { data: campaign } = await client
      .from('Campaign')
      .select('id, title, organizationId')
      .eq('slug', dto.campaignSlug)
      .eq('status', CampaignStatus.Active)
      .eq('isActive', true)
      .maybeSingle();

    if (!campaign) {
      throw new NotFoundException('Active campaign not found');
    }

    const receiptNumber = this.generateReceiptNumber();

    const { data, error } = await client.rpc('record_public_donation', {
      p_campaign_slug: dto.campaignSlug,
      p_donor_name: dto.donorName || 'Anonymous',
      p_donor_email: dto.donorEmail ?? null,
      p_donor_phone: dto.donorPhone ?? null,
      p_amount: dto.amount,
      p_payment_method: dto.paymentMethod ?? null,
      p_payment_reference: dto.paymentReference ?? null,
      p_receipt_number: receiptNumber,
    });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const donation = Array.isArray(data) ? data[0] : data;

    return {
      ...donation,
      campaignTitle: campaign.title,
      donorName: dto.donorName,
    };
  }

  async getReceiptByNumber(receiptNumber: string) {
    const { data: donation, error } = await this.supabase
      .getClient()
      .from('Donation')
      .select('*, donor:Donor(*), campaign:Campaign(*)')
      .eq('receiptNumber', receiptNumber)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!donation) {
      throw new NotFoundException('Receipt not found');
    }

    return {
      receiptNumber: donation.receiptNumber,
      amount: Number(donation.amount),
      currency: donation.currency,
      donorName: donation.donor?.fullName || 'Anonymous',
      donorEmail: donation.donor?.email || null,
      donorPhone: donation.donor?.phone || 'N/A',
      campaignTitle: donation.campaign?.title || 'General Fund',
      paymentMethod: donation.paymentMethod || 'N/A',
      paymentReference: donation.paymentReference || null,
      donatedAt: donation.donatedAt,
    };
  }

  async findAll(organizationId: number, page: number, limit: number) {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await this.supabase
      .getClient()
      .from('Donation')
      .select('*, campaign:Campaign(*), donor:Donor(*), recordedBy:User(*)', { count: 'exact' })
      .eq('organizationId', organizationId)
      .order('donatedAt', { ascending: false })
      .range(from, to);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async getReceipt(organizationId: number, donationId: number) {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const { data: donation, error } = await this.supabase
      .getClient()
      .from('Donation')
      .select('*, campaign:Campaign(*), donor:Donor(*), organization:Organization(*)')
      .eq('id', donationId)
      .eq('organizationId', organizationId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!donation) {
      throw new NotFoundException('Donation receipt not found');
    }

    return donation;
  }
}
