import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main(): Promise<void> {
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await client.from('User').select('id').eq('email', 'superadmin@donorflow.app').maybeSingle();

  if (existing) {
    console.log('Super admin already exists');
    return;
  }

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: 'superadmin@donorflow.app',
    password: 'SuperAdmin123!',
    email_confirm: true,
  });

  if (createError || !created?.user) {
    throw new Error(`Failed to create super admin auth user: ${createError?.message}`);
  }

  const { error: insertError } = await client.from('User').insert({
    id: created.user.id,
    email: 'superadmin@donorflow.app',
    name: 'Super Admin',
    role: 'SUPER_ADMIN',
    isActive: true,
  });

  if (insertError) {
    await client.auth.admin.deleteUser(created.user.id);
    throw new Error(`Failed to create super admin profile: ${insertError.message}`);
  }

  console.log('Seeded super admin user');
}

void main();
