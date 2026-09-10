import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { DonorsModule } from './donors/donors.module';
import { DonationsModule } from './donations/donations.module';
import { ReportsModule } from './reports/reports.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UsersModule } from './users/users.module';
import { SupabaseAuthGuard } from './auth/guards/supabase-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MailModule } from './mail/mail.module';
import { SettingsModule } from './settings/settings.module';
import { PaymentsModule } from './payments/payments.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    SupabaseModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    CampaignsModule,
    DonorsModule,
    DonationsModule,
    ReportsModule,
    MailModule,
    SettingsModule,
    PaymentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
