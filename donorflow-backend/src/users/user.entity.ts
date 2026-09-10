import { UserRole } from '../common/types/user-role.enum';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  organizationId: number | null;
  createdAt: string;
  updatedAt: string;
}
