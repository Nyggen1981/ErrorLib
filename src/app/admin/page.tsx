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

  const [brandCount, manualCount, faultCount, brands, recentFaults] =
    await Promise.all([
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

  return (
    <AdminDashboard
      stats={{ brandCount, manualCount, faultCount }}
      brandStats={brandStats}
      recentActivity={recentActivity}
    />
  );
}
