-- Brand / manual data cleanup (one-time).
-- Preview changes with: npx tsx scripts/cleanup-brands-migration.ts
-- Apply via Prisma: npx prisma migrate deploy
--
-- 1) Move all manuals from brand slug 'mitsubishi' to 'mitsubishi-electric'
UPDATE "Manual"
SET "brandId" = (SELECT "id" FROM "Brand" WHERE "slug" = 'mitsubishi-electric' LIMIT 1)
WHERE "brandId" = (SELECT "id" FROM "Brand" WHERE "slug" = 'mitsubishi' LIMIT 1);

-- 2) Remove the duplicate 'mitsubishi' brand row (must have no manuals left)
DELETE FROM "Brand" WHERE "slug" = 'mitsubishi';

-- 3) Move misplaced ABB ACS800 manual from Allen-Bradley (or any brand) to ABB
UPDATE "Manual"
SET "brandId" = (SELECT "id" FROM "Brand" WHERE "slug" = 'abb' LIMIT 1)
WHERE "slug" = 'abb-acs800-standard-firmware';

-- 4) Remove consumer manual; FaultCode rows cascade on Manual delete (schema onDelete: Cascade)
DELETE FROM "Manual" WHERE "slug" = 'omron-bp760n-blood-pressure-monitor';
