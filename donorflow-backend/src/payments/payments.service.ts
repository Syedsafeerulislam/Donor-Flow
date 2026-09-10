import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SafepayService } from './safepay.service';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly safepay: SafepayService,
  ) {}

  async createSession(dto: CreatePaymentSessionDto, organizationIdFromAuth: number | null) {
    const client = this.supabase.getClient();

    const { data: campaign, error: campaignError } = await client
      .from('Campaign')
      .select('*, organization:Organization(*)')
      .eq('slug', dto.campaignSlug)
      .eq('status', 'Active')
      .maybeSingle();

    if (campaignError) {
      throw new InternalServerErrorException(campaignError.message);
    }
    if (!campaign) {
      throw new NotFoundException('Campaign not found or inactive');
    }

    const organizationId = campaign.organizationId;

    if (dto.amount < 50) {
      throw new BadRequestException('Minimum donation amount is PKR 50');
    }

    const reference = `DON-${Date.now()}-${randomBytes(4).toString('hex')}`;

    const { error: insertError } = await client.from('PaymentIntent').insert({
      reference,
      organizationId,
      campaignId: campaign.id,
      amount: dto.amount,
      currency: 'PKR',
      donorName: dto.donorName || null,
      donorEmail: dto.donorEmail || null,
      donorPhone: dto.donorPhone || null,
      status: 'INITIATED',
    });

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const checkoutUrl = await this.safepay.createCheckoutSession({
      organizationId,
      reference,
      amount: dto.amount,
      currency: 'PKR',
      cancelUrl: `${frontendUrl}/donation/cancel?ref=${reference}`,
      redirectUrl: `${frontendUrl}/donation/success?ref=${reference}`,
      isMonthly: dto.isMonthly,
      planId: process.env.SAFEPAY_DEFAULT_PLAN_ID,
    });

    return {
      checkoutUrl,
      reference,
    };
  }

  async handleSuccessfulCheckout(params: { reference: string }) {
    const { data: intent, error } = await this.supabase
      .getClient()
      .from('PaymentIntent')
      .select('*')
      .eq('reference', params.reference)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!intent) {
      throw new NotFoundException('Payment session not found');
    }

    return {
      status: 'pending_verification',
      reference: params.reference,
      amount: Number(intent.amount),
    };
  }

  async processWebhook(payload: any) {
    const eventType = payload.event || payload.type;
    const reference = payload.order_id || payload.reference;

    if (!reference) {
      return { received: false, message: 'No reference in webhook' };
    }

    const client = this.supabase.getClient();

    const { data: intent, error: intentError } = await client
      .from('PaymentIntent')
      .select('status')
      .eq('reference', reference)
      .maybeSingle();

    if (intentError) {
      throw new InternalServerErrorException(intentError.message);
    }
    if (!intent) {
      return { received: false, message: 'Payment intent not found' };
    }

    if (intent.status === 'COMPLETED') {
      return { received: true, message: 'Already processed' };
    }

    if (eventType === 'checkout.paid' || eventType === 'payment.completed') {
      const { error: rpcError } = await client.rpc('complete_payment_intent', {
        p_reference: reference,
        p_gateway_payment_id: payload.payment_id || payload.id || null,
        p_receipt_number: `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      });

      if (rpcError) {
        throw new InternalServerErrorException(rpcError.message);
      }

      return { received: true, message: 'Donation completed' };
    }

    if (eventType === 'checkout.cancelled' || eventType === 'payment.failed') {
      const { error: failError } = await client
        .from('PaymentIntent')
        .update({ status: 'FAILED' })
        .eq('reference', reference)
        .eq('status', 'INITIATED');

      if (failError) {
        throw new InternalServerErrorException(failError.message);
      }

      return { received: true, message: 'Payment failed' };
    }

    return { received: true, message: 'Event processed' };
  }

  async verifySessionStatus(sessionId: string) {
    const client = this.supabase.getClient();

    const { data: intent, error: intentError } = await client
      .from('PaymentIntent')
      .select('*')
      .eq('reference', sessionId)
      .maybeSingle();

    if (intentError) {
      throw new InternalServerErrorException(intentError.message);
    }
    if (!intent) {
      throw new NotFoundException('Session not found');
    }

    const { data: donation } = await client
      .from('Donation')
      .select('id, status')
      .eq('gatewaySessionId', sessionId)
      .maybeSingle();

    return {
      reference: intent.reference,
      amount: Number(intent.amount),
      intentStatus: intent.status,
      donationId: donation?.id,
      donationStatus: donation?.status,
    };
  }

  async getSubscriptionList(organizationId: number) {
    const { data, error } = await this.supabase
      .getClient()
      .from('Subscription')
      .select('*, campaign:Campaign(*), donor:Donor(*)')
      .eq('organizationId', organizationId)
      .order('createdAt', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ?? [];
  }

  async cancelSubscription(subscriptionId: number, organizationId: number) {
    const client = this.supabase.getClient();

    const { data: subscription, error } = await client
      .from('Subscription')
      .select('*')
      .eq('id', subscriptionId)
      .eq('organizationId', organizationId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.gatewaySubscriptionId) {
      await this.safepay.cancelSubscription(subscription.gatewaySubscriptionId, organizationId);
    }

    const { error: updateError } = await client
      .from('Subscription')
      .update({ status: 'CANCELLED', cancelledAt: new Date().toISOString() })
      .eq('id', subscriptionId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    return { message: 'Subscription cancelled successfully' };
  }
}
