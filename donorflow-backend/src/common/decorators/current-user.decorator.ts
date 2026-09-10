import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../types/user-role.enum';

export interface JwtUserPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: number | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ user?: JwtUserPayload }>();
    return request.user;
  },
);
