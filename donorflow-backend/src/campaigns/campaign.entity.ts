import { CampaignStatus } from '../common/types/campaign-status.enum';
import { CampaignType } from '../common/types/campaign-type.enum';

export interface Campaign {
  id: number;
  organizationId: number;
  title: string;
  slug: string;
  description: string | null;
  type: CampaignType;
  category: string | null;
  bannerImageUrl: string | null;
  status: CampaignStatus;
  goalAmount: number;
  currentAmount: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  presetAmounts: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
