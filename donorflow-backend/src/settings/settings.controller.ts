import {
  Controller, Get, Patch, Post, Body, Param, UseGuards,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { SettingsService } from './settings.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/types/user-role.enum';
import { CurrentOrganization } from '../common/decorators/current-organization.decorator';
import { StorageService } from '../supabase/storage.service';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly storageService: StorageService,
  ) {}

  @Get('organization')
  @Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
  async getSettings(@CurrentOrganization() orgId: number | null) {
    return this.settingsService.getOrganizationSettings(orgId);
  }

  @Patch('branding')
  @Roles(UserRole.ORG_ADMIN)
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiConsumes('multipart/form-data')
  async updateBranding(
    @CurrentOrganization() orgId: number | null,
    @Body() dto: UpdateBrandingDto,
    @UploadedFile() logoFile?: Express.Multer.File,
  ) {
    let logoUrl = dto.logoUrl;

    if (logoFile) {
      if (!ALLOWED_MIME_TYPES.includes(logoFile.mimetype)) {
        throw new BadRequestException('Invalid file type. Only JPG, PNG, WEBP, SVG allowed.');
      }
      if (logoFile.size > MAX_FILE_SIZE) {
        throw new BadRequestException('File too large. Maximum size is 2MB.');
      }

      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = logoFile.originalname.split('.').pop();
      const path = `logos/logo-${uniqueSuffix}.${ext}`;
      logoUrl = await this.storageService.uploadPublicFile(path, logoFile.buffer, logoFile.mimetype);
    }

    return this.settingsService.updateBranding(orgId, { ...dto, logoUrl });
  }

  @Post('payments/:provider')
  @Roles(UserRole.ORG_ADMIN)
  async updatePayment(
    @CurrentOrganization() orgId: number | null,
    @Param('provider') provider: string,
    @Body() data: any,
  ) {
    return this.settingsService.updatePaymentConfig(orgId, provider.toUpperCase(), data);
  }
}
