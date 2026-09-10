-- DonorFlow consolidated schema for Supabase (replaces Prisma migrations)
-- Run this once in the Supabase SQL Editor (Project omrfmvavixjjmomsdqcz -> SQL Editor).
-- Safe to re-run: enums/tables/indexes/triggers are all guarded to be idempotent.
--
-- Table/column names intentionally match what Prisma already created (quoted camelCase),
-- so the NestJS API's response shape (and therefore the frontend contract) does not change.
-- The only structural change vs. the old Prisma schema: "User" becomes an auth-linked table
-- whose id is a uuid referencing auth.users(id) instead of an autoincrement int, since identity
-- now lives in Supabase Auth. RefreshToken/PasswordResetToken/AuditLog are dropped (unused, or
-- superseded by Supabase Auth's own session/recovery-token management).

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ORG_ADMIN', 'STAFF', 'DONOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CampaignStatus" AS ENUM ('Draft', 'Active', 'Completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CampaignType" AS ENUM ('DONATION', 'ZAKAT', 'SADQAH', 'EMERGENCY_RELIEF', 'EDUCATION', 'HEALTHCARE', 'FOOD_DRIVE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Organization (created_by_id FK to "User" added after "User" exists, see below)
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "website" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "description" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0F172A',
    "secondaryColor" TEXT NOT NULL DEFAULT '#2563EB',
    "registrationNo" TEXT,
    "websiteUrl" TEXT,
    "taxExemption" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "User" - identity now lives in Supabase Auth (auth.users). This table mirrors profile data.
CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" INTEGER REFERENCES "Organization"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deferred FK: Organization.createdById -> User.id (the two tables reference each other)
DO $$ BEGIN
  ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" SERIAL PRIMARY KEY,
    "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "CampaignType" NOT NULL DEFAULT 'DONATION',
    "category" TEXT,
    "bannerImageUrl" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'Draft',
    "goalAmount" NUMERIC(12,2) NOT NULL,
    "currentAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMPTZ,
    "endDate" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "presetAmounts" TEXT,
    "createdById" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Campaign_organizationId_slug_key" UNIQUE ("organizationId", "slug")
);

CREATE TABLE IF NOT EXISTS "Donor" (
    "id" SERIAL PRIMARY KEY,
    "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" SERIAL PRIMARY KEY,
    "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    "donorId" INTEGER REFERENCES "Donor"("id") ON DELETE SET NULL,
    "campaignId" INTEGER NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
    "amount" NUMERIC(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "interval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "gatewaySubscriptionId" TEXT,
    "gatewayCustomerId" TEXT,
    "currentPeriodEnd" TIMESTAMPTZ,
    "nextBillingDate" TIMESTAMPTZ,
    "cancelledAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Donation" (
    "id" SERIAL PRIMARY KEY,
    "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    "campaignId" INTEGER REFERENCES "Campaign"("id") ON DELETE SET NULL,
    "donorId" INTEGER REFERENCES "Donor"("id") ON DELETE SET NULL,
    "amount" NUMERIC(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "receiptNumber" TEXT,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "gatewaySessionId" TEXT,
    "gatewayPaymentId" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionId" INTEGER REFERENCES "Subscription"("id") ON DELETE SET NULL,
    "notes" TEXT,
    "donatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "recordedById" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "Donation_receiptNumber_key" UNIQUE ("receiptNumber")
);

CREATE TABLE IF NOT EXISTS "PaymentConfig" (
    "id" SERIAL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "merchantId" TEXT,
    "apiKey" TEXT,
    "isLiveMode" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
    CONSTRAINT "PaymentConfig_organizationId_provider_key" UNIQUE ("organizationId", "provider")
);

CREATE TABLE IF NOT EXISTS "PaymentIntent" (
    "id" SERIAL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "campaignId" INTEGER,
    "amount" NUMERIC(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "donorName" TEXT,
    "donorEmail" TEXT,
    "donorPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "PaymentIntent_reference_key" UNIQUE ("reference")
);

-- Dropped entirely (unused, or superseded by Supabase Auth): RefreshToken, PasswordResetToken, AuditLog

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX IF NOT EXISTS "Organization_isActive_idx" ON "Organization"("isActive");

CREATE INDEX IF NOT EXISTS "Campaign_organizationId_idx" ON "Campaign"("organizationId");
CREATE INDEX IF NOT EXISTS "Campaign_isActive_idx" ON "Campaign"("isActive");
CREATE INDEX IF NOT EXISTS "Campaign_status_idx" ON "Campaign"("status");
CREATE INDEX IF NOT EXISTS "Campaign_type_idx" ON "Campaign"("type");
CREATE INDEX IF NOT EXISTS "Campaign_startDate_endDate_idx" ON "Campaign"("startDate", "endDate");

CREATE INDEX IF NOT EXISTS "Donor_organizationId_idx" ON "Donor"("organizationId");
CREATE INDEX IF NOT EXISTS "Donor_email_idx" ON "Donor"("email");
CREATE INDEX IF NOT EXISTS "Donor_isActive_idx" ON "Donor"("isActive");

CREATE INDEX IF NOT EXISTS "Donation_organizationId_idx" ON "Donation"("organizationId");
CREATE INDEX IF NOT EXISTS "Donation_campaignId_idx" ON "Donation"("campaignId");
CREATE INDEX IF NOT EXISTS "Donation_donorId_idx" ON "Donation"("donorId");
CREATE INDEX IF NOT EXISTS "Donation_status_idx" ON "Donation"("status");
CREATE INDEX IF NOT EXISTS "Donation_gatewaySessionId_idx" ON "Donation"("gatewaySessionId");
CREATE INDEX IF NOT EXISTS "Donation_gatewayPaymentId_idx" ON "Donation"("gatewayPaymentId");
CREATE INDEX IF NOT EXISTS "Donation_donatedAt_idx" ON "Donation"("donatedAt");

CREATE INDEX IF NOT EXISTS "Subscription_organizationId_idx" ON "Subscription"("organizationId");
CREATE INDEX IF NOT EXISTS "Subscription_campaignId_idx" ON "Subscription"("campaignId");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX IF NOT EXISTS "Subscription_gatewaySubscriptionId_idx" ON "Subscription"("gatewaySubscriptionId");

CREATE INDEX IF NOT EXISTS "PaymentIntent_reference_idx" ON "PaymentIntent"("reference");
CREATE INDEX IF NOT EXISTS "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- ============================================================================
-- updated_at auto-touch trigger (Prisma's @updatedAt no longer applies)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','Organization','Campaign','Donor','Subscription','Donation','PaymentIntent'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ============================================================================
-- RPC FUNCTIONS (atomic multi-table writes - called via supabase.rpc())
-- ============================================================================

-- 1. Register: create an Organization + its first ORG_ADMIN User atomically.
--    The auth user itself must already exist (created via supabase.auth.admin.createUser()
--    before calling this) - on failure here, the caller must delete that auth user.
CREATE OR REPLACE FUNCTION create_organization_with_admin(
  p_org_name TEXT,
  p_org_slug TEXT,
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_org_id INTEGER;
BEGIN
  INSERT INTO "Organization" ("name", "slug", "createdById")
  VALUES (p_org_name, p_org_slug, p_user_id)
  RETURNING "id" INTO v_org_id;

  INSERT INTO "User" ("id", "email", "name", "role", "organizationId")
  VALUES (p_user_id, p_email, p_name, 'ORG_ADMIN', v_org_id);

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Staff creation: insert a User profile row for an already-created auth user.
CREATE OR REPLACE FUNCTION create_staff_profile(
  p_user_id UUID,
  p_organization_id INTEGER,
  p_email TEXT,
  p_name TEXT,
  p_phone TEXT,
  p_role "UserRole"
) RETURNS VOID AS $$
BEGIN
  INSERT INTO "User" ("id", "email", "name", "phone", "role", "organizationId")
  VALUES (p_user_id, p_email, p_name, p_phone, p_role, p_organization_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Internal donation entry: insert a Donation and bump the campaign total atomically.
CREATE OR REPLACE FUNCTION record_donation(
  p_organization_id INTEGER,
  p_campaign_id INTEGER,
  p_donor_id INTEGER,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_payment_reference TEXT,
  p_receipt_number TEXT,
  p_notes TEXT,
  p_recorded_by_id UUID
) RETURNS "Donation" AS $$
DECLARE
  v_donation "Donation";
BEGIN
  INSERT INTO "Donation" (
    "organizationId", "campaignId", "donorId", "amount", "currency",
    "paymentMethod", "paymentReference", "receiptNumber", "notes",
    "status", "recordedById"
  ) VALUES (
    p_organization_id, p_campaign_id, p_donor_id, p_amount, COALESCE(p_currency, 'PKR'),
    p_payment_method, p_payment_reference, p_receipt_number, p_notes,
    'COMPLETED', p_recorded_by_id
  ) RETURNING * INTO v_donation;

  IF p_campaign_id IS NOT NULL THEN
    UPDATE "Campaign" SET "currentAmount" = "currentAmount" + p_amount WHERE "id" = p_campaign_id;
  END IF;

  RETURN v_donation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Public donation: find/create the donor by email within the campaign's org, insert the
--    donation, bump the campaign total - all atomically.
CREATE OR REPLACE FUNCTION record_public_donation(
  p_campaign_slug TEXT,
  p_donor_name TEXT,
  p_donor_email TEXT,
  p_donor_phone TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_reference TEXT,
  p_receipt_number TEXT
) RETURNS "Donation" AS $$
DECLARE
  v_campaign "Campaign";
  v_donor_id INTEGER;
  v_donation "Donation";
BEGIN
  SELECT * INTO v_campaign FROM "Campaign" WHERE "slug" = p_campaign_slug AND "isActive" = true LIMIT 1;
  IF v_campaign."id" IS NULL THEN
    RAISE EXCEPTION 'Campaign not found or inactive: %', p_campaign_slug;
  END IF;

  IF p_donor_email IS NOT NULL THEN
    SELECT "id" INTO v_donor_id FROM "Donor"
      WHERE "organizationId" = v_campaign."organizationId" AND "email" = p_donor_email
      LIMIT 1;
  END IF;

  IF v_donor_id IS NULL THEN
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone")
    VALUES (v_campaign."organizationId", p_donor_name, p_donor_email, p_donor_phone)
    RETURNING "id" INTO v_donor_id;
  END IF;

  INSERT INTO "Donation" (
    "organizationId", "campaignId", "donorId", "amount", "currency",
    "paymentMethod", "paymentReference", "receiptNumber", "status"
  ) VALUES (
    v_campaign."organizationId", v_campaign."id", v_donor_id, p_amount, 'PKR',
    p_payment_method, p_payment_reference, p_receipt_number, 'COMPLETED'
  ) RETURNING * INTO v_donation;

  UPDATE "Campaign" SET "currentAmount" = "currentAmount" + p_amount WHERE "id" = v_campaign."id";

  RETURN v_donation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Payment webhook completion: idempotent (no-op if already COMPLETED), locks the intent
--    row to serialize concurrent webhook deliveries.
CREATE OR REPLACE FUNCTION complete_payment_intent(
  p_reference TEXT,
  p_gateway_payment_id TEXT,
  p_receipt_number TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_intent "PaymentIntent";
  v_donor_id INTEGER;
  v_donation_id INTEGER;
BEGIN
  SELECT * INTO v_intent FROM "PaymentIntent" WHERE "reference" = p_reference FOR UPDATE;
  IF v_intent."id" IS NULL THEN
    RAISE EXCEPTION 'Payment intent not found: %', p_reference;
  END IF;

  IF v_intent."status" = 'COMPLETED' THEN
    SELECT "id" INTO v_donation_id FROM "Donation" WHERE "gatewaySessionId" = p_reference LIMIT 1;
    RETURN v_donation_id;
  END IF;

  IF v_intent."donorEmail" IS NOT NULL THEN
    SELECT "id" INTO v_donor_id FROM "Donor"
      WHERE "organizationId" = v_intent."organizationId" AND "email" = v_intent."donorEmail"
      LIMIT 1;
  END IF;

  IF v_donor_id IS NULL THEN
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone")
    VALUES (v_intent."organizationId", COALESCE(v_intent."donorName", 'Anonymous'), v_intent."donorEmail", v_intent."donorPhone")
    RETURNING "id" INTO v_donor_id;
  END IF;

  INSERT INTO "Donation" (
    "organizationId", "campaignId", "donorId", "amount", "currency",
    "gatewaySessionId", "gatewayPaymentId", "receiptNumber", "status"
  ) VALUES (
    v_intent."organizationId", v_intent."campaignId", v_donor_id, v_intent."amount", v_intent."currency",
    p_reference, p_gateway_payment_id, p_receipt_number, 'COMPLETED'
  ) RETURNING "id" INTO v_donation_id;

  IF v_intent."campaignId" IS NOT NULL THEN
    UPDATE "Campaign" SET "currentAmount" = "currentAmount" + v_intent."amount" WHERE "id" = v_intent."campaignId";
  END IF;

  UPDATE "PaymentIntent" SET "status" = 'COMPLETED' WHERE "id" = v_intent."id";

  RETURN v_donation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. fail_payment_intent is a single-table write - done directly via supabase-js
--    .update({status:'FAILED'}).eq('reference', ref).eq('status','INITIATED'), no RPC needed.

-- 7. Cleanup cron: expire stale PENDING donations and decrement their campaigns' totals
--    in one set-based statement.
CREATE OR REPLACE FUNCTION expire_pending_donations(p_cutoff TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE "Donation"
    SET "status" = 'EXPIRED'
    WHERE "status" = 'PENDING' AND "donatedAt" < p_cutoff
    RETURNING "campaignId", "amount"
  ), decremented AS (
    UPDATE "Campaign" c
    SET "currentAmount" = c."currentAmount" - sub.total
    FROM (
      SELECT "campaignId", SUM("amount") AS total
      FROM expired
      WHERE "campaignId" IS NOT NULL
      GROUP BY "campaignId"
    ) sub
    WHERE c."id" = sub."campaignId"
    RETURNING c."id"
  )
  SELECT count(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Dashboard reporting RPCs
CREATE OR REPLACE FUNCTION get_dashboard_totals(p_organization_id INTEGER)
RETURNS TABLE (
  total_raised NUMERIC,
  donor_count BIGINT,
  active_campaign_count BIGINT,
  month_raised NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM("amount") FROM "Donation" WHERE "organizationId" = p_organization_id AND "status" = 'COMPLETED'), 0),
    (SELECT count(*) FROM "Donor" WHERE "organizationId" = p_organization_id AND "isActive" = true),
    (SELECT count(*) FROM "Campaign" WHERE "organizationId" = p_organization_id AND "status" = 'Active'),
    COALESCE((
      SELECT SUM("amount") FROM "Donation"
      WHERE "organizationId" = p_organization_id AND "status" = 'COMPLETED'
        AND "donatedAt" >= date_trunc('month', now())
    ), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_donation_trend(p_organization_id INTEGER, p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, total NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT date_trunc('day', "donatedAt")::date AS day, SUM("amount") AS total
  FROM "Donation"
  WHERE "organizationId" = p_organization_id AND "status" = 'COMPLETED'
    AND "donatedAt" >= now() - (p_days || ' days')::interval
  GROUP BY day
  ORDER BY day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_top_campaigns(p_organization_id INTEGER, p_limit INTEGER DEFAULT 3)
RETURNS SETOF "Campaign" AS $$
  SELECT * FROM "Campaign"
  WHERE "organizationId" = p_organization_id
  ORDER BY "currentAmount" DESC
  LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 9. Campaign report: campaigns with a donation_count column
CREATE OR REPLACE FUNCTION get_campaign_report(
  p_organization_id INTEGER,
  p_status "CampaignStatus" DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (campaign "Campaign", donation_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT c, COUNT(d."id")
  FROM "Campaign" c
  LEFT JOIN "Donation" d ON d."campaignId" = c."id"
  WHERE c."organizationId" = p_organization_id
    AND (p_status IS NULL OR c."status" = p_status)
    AND (p_category IS NULL OR c."category" = p_category)
  GROUP BY c."id"
  ORDER BY c."createdAt" DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 10. Donor report: donors with pre-aggregated totals
CREATE OR REPLACE FUNCTION get_donor_report(p_organization_id INTEGER, p_limit INTEGER DEFAULT 100)
RETURNS TABLE (donor "Donor", total_donated NUMERIC, donation_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT d, COALESCE(SUM(dn."amount"), 0), COUNT(dn."id")
  FROM "Donor" d
  LEFT JOIN "Donation" dn ON dn."donorId" = d."id" AND dn."status" = 'COMPLETED'
  WHERE d."organizationId" = p_organization_id
  GROUP BY d."id"
  ORDER BY total_donated DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
