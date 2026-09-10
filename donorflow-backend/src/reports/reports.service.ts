import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CampaignReportDto } from './dto/campaign-report.dto';
import { DonationReportDto } from './dto/donation-report.dto';
import { DonorReportDto } from './dto/donor-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getDashboardStats(organizationId: number) {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const client = this.supabase.getClient();

    const [totalsResult, trendResult, topCampaignsResult, recentDonationsResult] = await Promise.all([
      client.rpc('get_dashboard_totals', { p_organization_id: organizationId }),
      client.rpc('get_donation_trend', { p_organization_id: organizationId, p_days: 30 }),
      client.rpc('get_top_campaigns', { p_organization_id: organizationId, p_limit: 3 }),
      client
        .from('Donation')
        .select('id, amount, donatedAt, donor:Donor(fullName), campaign:Campaign(title)')
        .eq('organizationId', organizationId)
        .order('donatedAt', { ascending: false })
        .limit(5),
    ]);

    if (totalsResult.error) throw new InternalServerErrorException(totalsResult.error.message);
    if (trendResult.error) throw new InternalServerErrorException(trendResult.error.message);
    if (topCampaignsResult.error) throw new InternalServerErrorException(topCampaignsResult.error.message);
    if (recentDonationsResult.error) throw new InternalServerErrorException(recentDonationsResult.error.message);

    const totals = Array.isArray(totalsResult.data) ? totalsResult.data[0] : totalsResult.data;

    return {
      totalRaised: Number(totals?.total_raised ?? 0),
      totalDonors: Number(totals?.donor_count ?? 0),
      activeCampaigns: Number(totals?.active_campaign_count ?? 0),
      monthlyRaised: Number(totals?.month_raised ?? 0),
      recentDonations: (recentDonationsResult.data ?? []).map((d: any) => ({
        id: d.id,
        amount: Number(d.amount),
        donorName: d.donor?.fullName || 'Anonymous',
        campaignTitle: d.campaign?.title || 'General',
        donatedAt: d.donatedAt,
      })),
      donationTrends: (trendResult.data ?? []).map((t: any) => ({
        date: t.day,
        amount: Number(t.total),
      })),
      topCampaigns: (topCampaignsResult.data ?? []).map((c: any) => ({
        title: c.title,
        raised: Number(c.currentAmount),
        goal: Number(c.goalAmount),
      })),
    };
  }

  async getDonationReport(organizationId: number, filters: DonationReportDto) {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    let query = this.supabase
      .getClient()
      .from('Donation')
      .select('*, donor:Donor(*), campaign:Campaign(*), recordedBy:User(*)')
      .eq('organizationId', organizationId)
      .order('donatedAt', { ascending: false });

    if (filters.startDate) {
      query = query.gte('donatedAt', new Date(filters.startDate).toISOString());
    }
    if (filters.endDate) {
      query = query.lte('donatedAt', new Date(filters.endDate).toISOString());
    }
    if (filters.campaignId) {
      query = query.eq('campaignId', filters.campaignId);
    }
    if (filters.paymentMethod) {
      query = query.eq('paymentMethod', filters.paymentMethod);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const donations = data ?? [];
    const totalAmount = donations.reduce((sum: number, d: any) => sum + Number(d.amount), 0);

    return {
      data: donations.map((d: any) => ({
        id: d.id,
        amount: Number(d.amount),
        currency: d.currency,
        donorName: d.donor?.fullName || 'Anonymous',
        donorEmail: d.donor?.email,
        campaignTitle: d.campaign?.title || 'General',
        paymentMethod: d.paymentMethod,
        receiptNumber: d.receiptNumber,
        donatedAt: d.donatedAt,
      })),
      summary: {
        totalDonations: donations.length,
        totalAmount,
        averageDonation: donations.length > 0 ? totalAmount / donations.length : 0,
      },
    };
  }

  async getCampaignReport(organizationId: number, filters: CampaignReportDto) {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const { data, error } = await this.supabase.getClient().rpc('get_campaign_report', {
      p_organization_id: organizationId,
      p_status: filters.status ?? null,
      p_category: filters.category ?? null,
    });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = data ?? [];

    const mapped = rows.map((row: any) => {
      const c = row.campaign;
      const goalAmount = Number(c.goalAmount);
      const currentAmount = Number(c.currentAmount);
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        category: c.category,
        goalAmount,
        currentAmount,
        progressPercentage: goalAmount > 0 ? (currentAmount / goalAmount) * 100 : 0,
        donationCount: Number(row.donation_count),
        startDate: c.startDate,
        endDate: c.endDate,
        publicUrl: `/donate/${c.slug}`,
      };
    });

    return {
      data: mapped,
      summary: {
        totalCampaigns: mapped.length,
        totalGoalAmount: mapped.reduce((sum: number, c: any) => sum + c.goalAmount, 0),
        totalRaised: mapped.reduce((sum: number, c: any) => sum + c.currentAmount, 0),
      },
    };
  }

  async getDonorReport(organizationId: number, filters: DonorReportDto) {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const topDonorsLimit = filters.topDonorsLimit || 10;

    const { data, error } = await this.supabase.getClient().rpc('get_donor_report', {
      p_organization_id: organizationId,
      p_limit: topDonorsLimit,
    });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = data ?? [];

    const donorsWithTotals = rows.map((row: any) => ({
      id: row.donor.id,
      fullName: row.donor.fullName,
      email: row.donor.email,
      phone: row.donor.phone,
      totalDonated: Number(row.total_donated),
      donationCount: Number(row.donation_count),
      createdAt: row.donor.createdAt,
    }));

    return {
      data: donorsWithTotals,
      summary: {
        totalDonors: donorsWithTotals.length,
        topDonorTotal: donorsWithTotals.length > 0 ? donorsWithTotals[0].totalDonated : 0,
      },
    };
  }

  async exportDonationReportCsv(organizationId: number, filters: DonationReportDto) {
    const report = await this.getDonationReport(organizationId, filters);

    const headers = [
      'Receipt Number',
      'Amount',
      'Currency',
      'Donor Name',
      'Donor Email',
      'Campaign',
      'Payment Method',
      'Date',
    ];

    const rows = report.data.map((d) => [
      d.receiptNumber,
      d.amount.toString(),
      d.currency,
      d.donorName,
      d.donorEmail || '',
      d.campaignTitle,
      d.paymentMethod || '',
      new Date(d.donatedAt).toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: unknown[]) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  async exportCampaignReportCsv(organizationId: number, filters: CampaignReportDto) {
    const report = await this.getCampaignReport(organizationId, filters);

    const headers = [
      'Campaign Title',
      'Status',
      'Category',
      'Goal Amount',
      'Current Amount',
      'Progress %',
      'Donation Count',
      'Start Date',
      'End Date',
      'Public URL',
    ];

    const rows = report.data.map((c: (typeof report.data)[number]) => [
      c.title,
      c.status,
      c.category || '',
      c.goalAmount.toString(),
      c.currentAmount.toString(),
      c.progressPercentage.toFixed(2),
      c.donationCount.toString(),
      c.startDate ? new Date(c.startDate).toISOString() : '',
      c.endDate ? new Date(c.endDate).toISOString() : '',
      c.publicUrl,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: unknown[]) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  async exportDonorReportCsv(organizationId: number, filters: DonorReportDto) {
    const report = await this.getDonorReport(organizationId, filters);

    const headers = ['Donor Name', 'Email', 'Phone', 'Total Donated', 'Donation Count', 'Joined Date'];

    const rows = report.data.map((d: (typeof report.data)[number]) => [
      d.fullName,
      d.email || '',
      d.phone || '',
      d.totalDonated.toString(),
      d.donationCount.toString(),
      new Date(d.createdAt).toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: unknown[]) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}
