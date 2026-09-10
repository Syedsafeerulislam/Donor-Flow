import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

const BUCKET = 'uploads';

@Injectable()
export class StorageService {
  constructor(private readonly supabase: SupabaseService) {}

  async uploadPublicFile(path: string, buffer: Buffer, contentType: string): Promise<string> {
    const { error } = await this.supabase
      .getClient()
      .storage.from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      throw new InternalServerErrorException(`Failed to upload file: ${error.message}`);
    }

    const { data } = this.supabase.getClient().storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}
