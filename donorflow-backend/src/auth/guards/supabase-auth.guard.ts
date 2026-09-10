import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { SupabaseService } from '../../supabase/supabase.service';
import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { cookies?: Record<string, string>; user?: JwtUserPayload }>();

    const token = request.cookies?.access_token ?? this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    const { data, error } = await this.supabase.createEphemeralClient().auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { data: profile, error: profileError } = await this.supabase
      .getClient()
      .from('User')
      .select('role, organizationId')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      throw new UnauthorizedException('No profile found for this account');
    }

    request.user = {
      sub: data.user.id,
      email: data.user.email ?? '',
      role: profile.role,
      organizationId: profile.organizationId,
    };

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return undefined;
  }
}
