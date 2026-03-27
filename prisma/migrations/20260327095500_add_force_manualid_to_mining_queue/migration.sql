ALTER TABLE "MiningQueue"
ADD COLUMN "force" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "manualId" TEXT;

CREATE INDEX "MiningQueue_manualId_idx" ON "MiningQueue"("manualId");
