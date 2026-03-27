import type { PrismaClient } from "../../generated/prisma/client";

/**
 * Same notion as list-modules / dashboard headline: fault codes on manuals
 * that are not marked broken (PDF/link still valid for public use).
 */
export const listedFaultCodeWhere = {
  manual: { isBroken: false },
} as const;

export function countListedFaultCodes(prisma: PrismaClient) {
  return prisma.faultCode.count({ where: listedFaultCodeWhere });
}
