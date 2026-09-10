import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { PublicCampaignsController } from './public-campaigns.controller';

@Module({
  controllers: [CampaignsController, PublicCampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
