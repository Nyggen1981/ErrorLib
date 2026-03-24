import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const authed = await isAdminAuthenticated();
  if (!authed) redirect("/admin/login");

  const [
    brandCount,
    manualCount,
    faultCount,
    brands,
    recentFaults,
    miningLogs,
    queueItems,
    userRequests,
  ] = await Promise.all([
    prisma.brand.count(),
    prisma.manual.count(),
    prisma.faultCode.count(),
    prisma.brand.findMany({
      include: {
        _count: { select: { manuals: true } },
        manuals: {
          include: { _count: { select: { faultCodes: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.faultCode.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        manual: {
          include: { brand: true },
        },
      },
    }),
    prisma.miningLog.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    prisma.miningQueue.findMany({
      orderBy: { createdAt: "asc" },
    }),
    prisma.userRequest.findMany({
      orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);

  const brandStats = brands.map((b) => ({
    name: b.name,
    slug: b.slug,
    manuals: b._count.manuals,
    faultCodes: b.manuals.reduce((sum, m) => sum + m._count.faultCodes, 0),
  }));

  const recentActivity = recentFaults.map((f) => ({
    id: f.id,
    code: f.code,
    title: f.title,
    brandName: f.manual.brand.name,
    manualName: f.manual.name,
    createdAt: f.createdAt.toISOString(),
  }));

  const miningLogData = miningLogs.map((l) => ({
    id: l.id,
    brand: l.brand,
    manual: l.manual,
    codesFound: l.codesFound,
    pagesUsed: l.pagesUsed,
    durationMs: l.durationMs,
    status: l.status,
    message: l.message,
    createdAt: l.createdAt.toISOString(),
  }));

  const queueData = queueItems.map((q) => ({
    id: q.id,
    brandName: q.brandName,
    status: q.status,
    createdAt: q.createdAt.toISOString(),
  }));

  const userRequestData = userRequests.map((r) => ({
    id: r.id,
    brand: r.brand,
    model: r.model,
    status: r.status,
    voteCount: r.voteCount,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AdminDashboard
      stats={{ brandCount, manualCount, faultCount }}
      brandStats={brandStats}
      recentActivity={recentActivity}
      miningLogs={miningLogData}
      queue={queueData}
      userRequests={userRequestData}
    />
  );
}
