import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CleanupPendingDonationsTask } from './cleanup-pending-donations.task';

// Vercel Cron only issues GET requests and, when CRON_SECRET is set in the project's env vars,
// automatically attaches "Authorization: Bearer <CRON_SECRET>" to the request - this endpoint
// checks that header so the cleanup can't be triggered by anyone else.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
@Controller('internal/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(private readonly cleanupTask: CleanupPendingDonationsTask) {}

  @Public()
  @Get('cleanup-pending-donations')
  async cleanupPendingDonations(@Headers('authorization') authHeader?: string): Promise<{ ok: true }> {
    const secret = process.env.CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      throw new UnauthorizedException();
    }

    await this.cleanupTask.cleanupExpiredPendingDonations();
    return { ok: true };
  }
}
