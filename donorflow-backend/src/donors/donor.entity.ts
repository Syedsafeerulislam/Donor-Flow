export interface Donor {
  id: number;
  organizationId: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
