import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { EditCodesClient } from "./edit-codes-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit Fault Codes",
  robots: { index: false, follow: false },
};

export default async function EditCodesPage() {
  const authed = await isAdminAuthenticated();
  if (!authed) redirect("/admin/login");

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { name: true, slug: true },
  });

  return <EditCodesClient brands={brands} />;
}
