import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateDonorDto } from './dto/create-donor.dto';
import { UpdateDonorDto } from './dto/update-donor.dto';
import { Donor } from './donor.entity';

@Injectable()
export class DonorsService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(organizationId: number, userId: string, dto: CreateDonorDto): Promise<Donor> {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('Donor')
      .insert({
        fullName: dto.fullName,
        email: dto.email || null,
        phone: dto.phone || null,
        address: dto.address || null,
        notes: dto.notes || null,
        organizationId,
        createdById: userId,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Donor;
  }

  async findAll(
    organizationId: number,
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ data: Donor[]; total: number; page: number; limit: number }> {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .getClient()
      .from('Donor')
      .select('*', { count: 'exact' })
      .eq('organizationId', organizationId)
      .eq('isActive', true)
      .order('createdAt', { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(`fullName.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { data: (data as Donor[]) ?? [], total: count ?? 0, page, limit };
  }

  async findOne(organizationId: number, donorId: number): Promise<Donor & { donations: unknown[] }> {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('Donor')
      .select('*, donations:Donation(*)')
      .eq('id', donorId)
      .eq('organizationId', organizationId)
      .eq('isActive', true)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    if (!data) {
      throw new NotFoundException('Donor not found or access denied');
    }

    const donations = ((data as any).donations ?? [])
      .sort((a: any, b: any) => new Date(b.donatedAt).getTime() - new Date(a.donatedAt).getTime())
      .slice(0, 10);

    return { ...(data as any), donations };
  }

  async update(organizationId: number, donorId: number, dto: UpdateDonorDto): Promise<Donor> {
    await this.findOne(organizationId, donorId);

    const updateData: Record<string, unknown> = {
      ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('Donor')
      .update(updateData)
      .eq('id', donorId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Donor;
  }

  async remove(organizationId: number, donorId: number): Promise<{ message: string }> {
    await this.findOne(organizationId, donorId);

    const { error } = await this.supabase
      .getClient()
      .from('Donor')
      .update({ isActive: false })
      .eq('id', donorId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { message: 'Donor deactivated successfully' };
  }

  async bulkCreate(organizationId: number, userId: string, donors: CreateDonorDto[]): Promise<{ created: number; skipped: number }> {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    let created = 0;
    let skipped = 0;

    for (const donor of donors) {
      const { error } = await this.supabase
        .getClient()
        .from('Donor')
        .insert({
          fullName: donor.fullName,
          email: donor.email || null,
          phone: donor.phone || null,
          address: donor.address || null,
          notes: donor.notes || null,
          organizationId,
          createdById: userId,
        });

      if (error) {
        skipped++;
      } else {
        created++;
      }
    }

    return { created, skipped };
  }

  async importDonorsFromCsv(
    organizationId: number,
    csvBuffer: Buffer,
  ): Promise<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; name: string; error: string }>;
  }> {
    const csvText = csvBuffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');

    if (lines.length < 2) {
      return { imported: 0, skipped: 0, errors: [{ row: 1, name: 'N/A', error: 'CSV file is empty or has no data rows' }] };
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const nameIndex = headers.findIndex((h) => h === 'name' || h === 'full name' || h === 'fullname');
    const emailIndex = headers.findIndex((h) => h === 'email');
    const phoneIndex = headers.findIndex((h) => h === 'phone');
    const addressIndex = headers.findIndex((h) => h === 'address');

    if (nameIndex === -1 || emailIndex === -1) {
      return {
        imported: 0,
        skipped: 0,
        errors: [{ row: 1, name: 'N/A', error: 'CSV must have "name" and "email" columns' }],
      };
    }

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; name: string; error: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const rowNumber = i + 1;
      const columns = this.parseCsvLine(lines[i]);

      const name = (columns[nameIndex] || '').trim();
      const email = (columns[emailIndex] || '').trim().toLowerCase();
      const phone = phoneIndex !== -1 ? (columns[phoneIndex] || '').trim() : '';
      const address = addressIndex !== -1 ? (columns[addressIndex] || '').trim() : '';

      if (!name || !email) {
        errors.push({ row: rowNumber, name: name || 'N/A', error: 'Missing required fields: name and email' });
        continue;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push({ row: rowNumber, name, error: `Invalid email format: ${email}` });
        continue;
      }

      const { data: existing } = await this.supabase
        .getClient()
        .from('Donor')
        .select('id')
        .eq('organizationId', organizationId)
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error: insertError } = await this.supabase
        .getClient()
        .from('Donor')
        .insert({
          fullName: name,
          email,
          phone: phone || null,
          address: address || null,
          organizationId,
          isActive: true,
        });

      if (insertError) {
        errors.push({ row: rowNumber, name, error: 'Database error while creating donor' });
      } else {
        imported++;
      }
    }

    return { imported, skipped, errors };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  async exportToCsv(organizationId: number): Promise<string> {
    if (!organizationId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('Donor')
      .select('*')
      .eq('organizationId', organizationId)
      .eq('isActive', true)
      .order('createdAt', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const donors = (data as Donor[]) ?? [];
    const headers = ['Full Name', 'Email', 'Phone', 'Address', 'Notes', 'Created At'];
    const rows = donors.map((donor) => [
      donor.fullName,
      donor.email || '',
      donor.phone || '',
      donor.address || '',
      donor.notes || '',
      new Date(donor.createdAt).toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}
