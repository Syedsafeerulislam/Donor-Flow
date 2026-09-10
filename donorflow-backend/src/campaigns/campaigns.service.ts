import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { SupabaseService } from '../supabase/supabase.service';
import { CampaignStatus } from '../common/types/campaign-status.enum';
import { CampaignType } from '../common/types/campaign-type.enum';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { Campaign } from './campaign.entity';

type CampaignWithUrl = Campaign & { publicUrl: string };

@Injectable()
export class CampaignsService {
  constructor(private readonly supabase: SupabaseService) {}

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private buildPublicUrl(slug: string): string {
    return `/donate/${slug}`;
  }

  private withUrl(campaign: any): CampaignWithUrl {
    return {
      ...campaign,
      goalAmount: Number(campaign.goalAmount),
      currentAmount: Number(campaign.currentAmount),
      publicUrl: this.buildPublicUrl(campaign.slug),
    };
  }

  async create(organizationId: number | null, dto: CreateCampaignDto, createdById: string): Promise<CampaignWithUrl> {
    if (!organizationId) {
      throw new NotFoundException('Organization not found for the current user');
    }

    const baseSlug = this.slugify(dto.title);
    const slug = `${baseSlug}-${Date.now()}`;

    const { data, error } = await this.supabase
      .getClient()
      .from('Campaign')
      .insert({
        organizationId,
        createdById,
        title: dto.title,
        slug,
        description: dto.description,
        type: dto.type ?? CampaignType.DONATION,
        goalAmount: dto.goalAmount,
        category: dto.category,
        bannerImageUrl: dto.bannerImageUrl,
        startDate: dto.startDate ? new Date(dto.startDate).toISOString() : null,
        endDate: dto.endDate ? new Date(dto.endDate).toISOString() : null,
        presetAmounts: dto.presetAmounts,
        status: dto.status ?? CampaignStatus.Draft,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.withUrl(data);
  }

  async findAll(
    organizationId: number | null,
    page: number,
    limit: number,
    search?: string,
    type?: CampaignType,
  ): Promise<{ data: CampaignWithUrl[]; total: number; page: number; limit: number }> {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .getClient()
      .from('Campaign')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .order('createdAt', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }
    if (type) {
      query = query.eq('type', type);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      data: (data ?? []).map((campaign) => this.withUrl(campaign)),
      total: count ?? 0,
      page,
      limit,
    };
  }

  async findOne(organizationId: number | null, campaignId: number): Promise<CampaignWithUrl> {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('Campaign')
      .select('*')
      .eq('id', campaignId)
      .eq('organizationId', organizationId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException('Campaign not found');
    }

    return this.withUrl(data);
  }

  async update(organizationId: number | null, campaignId: number, dto: UpdateCampaignDto): Promise<CampaignWithUrl> {
    await this.findOne(organizationId, campaignId);

    const updateData: Record<string, unknown> = {
      ...(dto.title ? { title: dto.title, slug: `${this.slugify(dto.title)}-${Date.now()}` } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.goalAmount !== undefined ? { goalAmount: dto.goalAmount } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.bannerImageUrl !== undefined ? { bannerImageUrl: dto.bannerImageUrl } : {}),
      ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate).toISOString() } : {}),
      ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate).toISOString() } : {}),
      ...(dto.presetAmounts !== undefined ? { presetAmounts: dto.presetAmounts } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('Campaign')
      .update(updateData)
      .eq('id', campaignId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.withUrl(data);
  }

  async remove(organizationId: number | null, campaignId: number): Promise<{ message: string }> {
    await this.findOne(organizationId, campaignId);

    const { error } = await this.supabase.getClient().from('Campaign').delete().eq('id', campaignId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { message: 'Campaign deleted successfully' };
  }

  async getQrCode(campaignId: number): Promise<Buffer> {
    const { data, error } = await this.supabase
      .getClient()
      .from('Campaign')
      .select('slug')
      .eq('id', campaignId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException('Campaign not found');
    }

    const publicUrl = this.buildPublicUrl(data.slug);
    return QRCode.toBuffer(publicUrl);
  }

  async findPublicCampaigns(
    page: number,
    limit: number,
    search?: string,
    type?: CampaignType,
  ): Promise<{ data: CampaignWithUrl[]; total: number; page: number; limit: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .getClient()
      .from('Campaign')
      .select('*', { count: 'exact' })
      .eq('status', CampaignStatus.Active)
      .eq('isActive', true)
      .order('createdAt', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }
    if (type) {
      query = query.eq('type', type);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      data: (data ?? []).map((campaign) => this.withUrl(campaign)),
      total: count ?? 0,
      page,
      limit,
    };
  }

  async findPublicCampaignBySlug(slug: string): Promise<CampaignWithUrl> {
    const { data, error } = await this.supabase
      .getClient()
      .from('Campaign')
      .select('*')
      .eq('slug', slug)
      .eq('status', CampaignStatus.Active)
      .eq('isActive', true)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException('Campaign not found');
    }

    return this.withUrl(data);
  }
}
