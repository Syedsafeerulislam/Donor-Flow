-- DonorFlow sample data for local/demo testing.
-- Run this in the Supabase SQL Editor AFTER schema.sql has been applied.
-- Safe to re-run: it creates one demo organization (by slug) and skips insertion if it already exists.
--
-- This gives the dashboard and campaigns pages real numbers to show: 1 organization,
-- 4 campaigns (mixed status/type), 6 donors, and ~14 donations spread over the last 30 days
-- so the dashboard's donation trend chart has data too.

DO $$
DECLARE
  v_org_id INTEGER;
  v_admin_id UUID;
  v_campaign_1 INTEGER;
  v_campaign_2 INTEGER;
  v_campaign_3 INTEGER;
  v_campaign_4 INTEGER;
  v_donor_1 INTEGER;
  v_donor_2 INTEGER;
  v_donor_3 INTEGER;
  v_donor_4 INTEGER;
  v_donor_5 INTEGER;
  v_donor_6 INTEGER;
BEGIN
  -- Reuse the seeded super admin as the "createdBy" for demo records, if present.
  SELECT id INTO v_admin_id FROM "User" WHERE email = 'superadmin@donorflow.app' LIMIT 1;

  -- Skip if the demo org already exists (idempotent re-run).
  SELECT id INTO v_org_id FROM "Organization" WHERE slug = 'hope-foundation-demo';

  IF v_org_id IS NULL THEN
    INSERT INTO "Organization" ("name", "slug", "email", "phone", "isActive", "description", "createdById")
    VALUES ('Hope Foundation', 'hope-foundation-demo', 'contact@hopefoundation.org', '+92 300 1234567', true,
            'A demo NGO used to preview the DonorFlow dashboard with real data.', v_admin_id)
    RETURNING id INTO v_org_id;

    -- Campaigns
    INSERT INTO "Campaign" ("organizationId", "title", "slug", "description", "type", "category", "status", "goalAmount", "currentAmount", "startDate", "endDate", "isActive", "createdById")
    VALUES (v_org_id, 'Winter Relief Drive', 'winter-relief-drive-demo', 'Provide warm clothing and shelter for families in need this winter.', 'EMERGENCY_RELIEF', 'Relief', 'Active', 500000, 0, now() - interval '20 days', now() + interval '40 days', true, v_admin_id)
    RETURNING id INTO v_campaign_1;

    INSERT INTO "Campaign" ("organizationId", "title", "slug", "description", "type", "category", "status", "goalAmount", "currentAmount", "startDate", "endDate", "isActive", "createdById")
    VALUES (v_org_id, 'Girls Education Fund', 'girls-education-fund-demo', 'Fund school fees and supplies for girls in underserved communities.', 'EDUCATION', 'Education', 'Active', 800000, 0, now() - interval '15 days', now() + interval '75 days', true, v_admin_id)
    RETURNING id INTO v_campaign_2;

    INSERT INTO "Campaign" ("organizationId", "title", "slug", "description", "type", "category", "status", "goalAmount", "currentAmount", "startDate", "endDate", "isActive", "createdById")
    VALUES (v_org_id, 'Mobile Health Clinic', 'mobile-health-clinic-demo', 'Bring free healthcare checkups to remote villages.', 'HEALTHCARE', 'Health', 'Active', 350000, 0, now() - interval '10 days', now() + interval '50 days', true, v_admin_id)
    RETURNING id INTO v_campaign_3;

    INSERT INTO "Campaign" ("organizationId", "title", "slug", "description", "type", "category", "status", "goalAmount", "currentAmount", "startDate", "endDate", "isActive", "createdById")
    VALUES (v_org_id, 'Ramadan Food Packages 2026', 'ramadan-food-packages-2026-demo', 'Distribute food packages to families during Ramadan.', 'FOOD_DRIVE', 'Food', 'Completed', 200000, 0, now() - interval '90 days', now() - interval '30 days', true, v_admin_id)
    RETURNING id INTO v_campaign_4;

    -- Donors
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone", "isActive", "createdById") VALUES
      (v_org_id, 'Ahmed Raza', 'ahmed.raza@example.com', '+92 300 1111111', true, v_admin_id) RETURNING id INTO v_donor_1;
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone", "isActive", "createdById") VALUES
      (v_org_id, 'Fatima Sheikh', 'fatima.sheikh@example.com', '+92 300 2222222', true, v_admin_id) RETURNING id INTO v_donor_2;
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone", "isActive", "createdById") VALUES
      (v_org_id, 'Bilal Ahmed', 'bilal.ahmed@example.com', '+92 300 3333333', true, v_admin_id) RETURNING id INTO v_donor_3;
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone", "isActive", "createdById") VALUES
      (v_org_id, 'Ayesha Khan', 'ayesha.khan@example.com', '+92 300 4444444', true, v_admin_id) RETURNING id INTO v_donor_4;
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone", "isActive", "createdById") VALUES
      (v_org_id, 'Usman Tariq', 'usman.tariq@example.com', '+92 300 5555555', true, v_admin_id) RETURNING id INTO v_donor_5;
    INSERT INTO "Donor" ("organizationId", "fullName", "email", "phone", "isActive", "createdById") VALUES
      (v_org_id, 'Sana Malik', 'sana.malik@example.com', '+92 300 6666666', true, v_admin_id) RETURNING id INTO v_donor_6;

    -- Donations (all COMPLETED, spread over the last ~28 days so the dashboard trend chart has shape)
    INSERT INTO "Donation" ("organizationId", "campaignId", "donorId", "amount", "currency", "paymentMethod", "receiptNumber", "status", "donatedAt", "recordedById") VALUES
      (v_org_id, v_campaign_1, v_donor_1, 15000, 'PKR', 'EasyPaisa', 'RCPT-DEMO-0001', 'COMPLETED', now() - interval '27 days', v_admin_id),
      (v_org_id, v_campaign_1, v_donor_2, 25000, 'PKR', 'JazzCash', 'RCPT-DEMO-0002', 'COMPLETED', now() - interval '24 days', v_admin_id),
      (v_org_id, v_campaign_1, v_donor_3, 10000, 'PKR', 'Bank Transfer', 'RCPT-DEMO-0003', 'COMPLETED', now() - interval '20 days', v_admin_id),
      (v_org_id, v_campaign_2, v_donor_2, 50000, 'PKR', 'Card', 'RCPT-DEMO-0004', 'COMPLETED', now() - interval '18 days', v_admin_id),
      (v_org_id, v_campaign_2, v_donor_4, 30000, 'PKR', 'EasyPaisa', 'RCPT-DEMO-0005', 'COMPLETED', now() - interval '16 days', v_admin_id),
      (v_org_id, v_campaign_2, v_donor_5, 20000, 'PKR', 'JazzCash', 'RCPT-DEMO-0006', 'COMPLETED', now() - interval '14 days', v_admin_id),
      (v_org_id, v_campaign_3, v_donor_1, 12000, 'PKR', 'Bank Transfer', 'RCPT-DEMO-0007', 'COMPLETED', now() - interval '12 days', v_admin_id),
      (v_org_id, v_campaign_3, v_donor_6, 18000, 'PKR', 'Card', 'RCPT-DEMO-0008', 'COMPLETED', now() - interval '10 days', v_admin_id),
      (v_org_id, v_campaign_3, v_donor_3, 22000, 'PKR', 'EasyPaisa', 'RCPT-DEMO-0009', 'COMPLETED', now() - interval '8 days', v_admin_id),
      (v_org_id, v_campaign_4, v_donor_4, 40000, 'PKR', 'JazzCash', 'RCPT-DEMO-0010', 'COMPLETED', now() - interval '60 days', v_admin_id),
      (v_org_id, v_campaign_4, v_donor_5, 35000, 'PKR', 'Bank Transfer', 'RCPT-DEMO-0011', 'COMPLETED', now() - interval '55 days', v_admin_id),
      (v_org_id, v_campaign_1, v_donor_6, 8000, 'PKR', 'Card', 'RCPT-DEMO-0012', 'COMPLETED', now() - interval '5 days', v_admin_id),
      (v_org_id, v_campaign_2, v_donor_1, 27000, 'PKR', 'EasyPaisa', 'RCPT-DEMO-0013', 'COMPLETED', now() - interval '3 days', v_admin_id),
      (v_org_id, v_campaign_3, v_donor_2, 16000, 'PKR', 'JazzCash', 'RCPT-DEMO-0014', 'COMPLETED', now() - interval '1 days', v_admin_id);

    -- Roll each campaign's currentAmount up from its actual completed donations.
    UPDATE "Campaign" c
    SET "currentAmount" = sub.total
    FROM (
      SELECT "campaignId", SUM("amount") AS total
      FROM "Donation"
      WHERE "organizationId" = v_org_id AND "status" = 'COMPLETED'
      GROUP BY "campaignId"
    ) sub
    WHERE c."id" = sub."campaignId";

    RAISE NOTICE 'Demo data created for organization id %', v_org_id;
  ELSE
    RAISE NOTICE 'Demo organization already exists (id %), skipping.', v_org_id;
  END IF;

  -- Attach the seeded super admin to this org (only if not already in one), so logging in
  -- with superadmin@donorflow.app immediately shows this demo org's dashboard/campaigns.
  IF v_admin_id IS NOT NULL THEN
    UPDATE "User" SET "organizationId" = v_org_id WHERE "id" = v_admin_id AND "organizationId" IS NULL;
  END IF;
END $$;
