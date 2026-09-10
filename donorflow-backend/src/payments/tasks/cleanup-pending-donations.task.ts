import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class CleanupPendingDonationsTask {
  private readonly logger = new Logger(CleanupPendingDonationsTask.name);

  constructor(private readonly supabase: SupabaseService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpiredPendingDonations() {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: count, error } = await this.supabase.getClient().rpc('expire_pending_donations', {
      p_cutoff: thirtyMinutesAgo,
    });

    if (error) {
      this.logger.error(`Failed to expire pending donations: ${error.message}`);
      return;
    }

    if (count && count > 0) {
      this.logger.log(`Marked ${count} expired pending donations`);
    }
  }
}
