import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SafepayService } from './safepay.service';
import { SettingsModule } from '../settings/settings.module';
import { CleanupPendingDonationsTask } from './tasks/cleanup-pending-donations.task';
import { CronController } from './tasks/cron.controller';

@Module({
  imports: [SettingsModule],
  controllers: [PaymentsController, CronController],
  providers: [PaymentsService, SafepayService, CleanupPendingDonationsTask],
  exports: [PaymentsService, SafepayService],
})
export class PaymentsModule {}
