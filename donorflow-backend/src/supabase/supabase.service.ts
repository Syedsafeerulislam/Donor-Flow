import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;
  private readonly url: string;
  private readonly serviceRoleKey: string;

  constructor(configService: ConfigService) {
    this.url = configService.getOrThrow<string>('SUPABASE_URL');
    this.serviceRoleKey = configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.client = createClient(this.url, this.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  /**
   * Shared client for all .from()/.rpc()/.auth.admin.* calls. Its Authorization header must
   * stay pinned to the service-role key for the app's whole lifetime - never call a
   * session-establishing auth method (getUser, signInWithPassword, refreshSession, verifyOtp)
   * on this instance, since supabase-js swaps a client's PostgREST header to match its current
   * auth session as soon as one is set, silently downgrading every later query on this client
   * to the end user's (or nobody's) permissions. Use a fresh client from createEphemeralClient()
   * for any of those instead.
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * A brand-new, isolated client for a single session-establishing auth call
   * (getUser(token), signInWithPassword, refreshSession, verifyOtp). Never reused across
   * requests, so one call's session state can never leak into another's, or into getClient().
   */
  createEphemeralClient(): SupabaseClient {
    return createClient(this.url, this.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
}
