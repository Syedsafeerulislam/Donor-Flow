export interface Organization {
  id: number;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  isActive: boolean;
  createdById: string | null;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  registrationNo: string | null;
  websiteUrl: string | null;
  taxExemption: boolean;
  createdAt: string;
  updatedAt: string;
}
