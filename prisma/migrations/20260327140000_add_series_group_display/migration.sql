-- Optional display title overrides for computed brand-page series boxes
CREATE TABLE "SeriesGroup" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "seriesKey" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeriesGroup_brandId_seriesKey_key" ON "SeriesGroup"("brandId", "seriesKey");
CREATE INDEX "SeriesGroup_brandId_idx" ON "SeriesGroup"("brandId");

ALTER TABLE "SeriesGroup" ADD CONSTRAINT "SeriesGroup_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
