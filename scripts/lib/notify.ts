import { Resend } from "resend";
import { getPrisma } from "./db.js";
import { log } from "./logger.js";

const FROM_ADDRESS = "ErrorLib <notifications@errorlib.net>";

export async function notifyUsersForBrand(brand: string): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("[NOTIFY] RESEND_API_KEY not set, skipping notifications");
    return 0;
  }

  const prisma = getPrisma();
  const requests = await prisma.userRequest.findMany({
    where: {
      brand: { equals: brand, mode: "insensitive" },
      email: { not: null },
    },
    select: { email: true },
  });

  const emails = requests
    .map((r) => r.email)
    .filter((e): e is string => !!e);

  if (emails.length === 0) {
    log.info(`[NOTIFY] No user emails to notify for ${brand}`);
    return 0;
  }

  const resend = new Resend(apiKey);
  const brandSlug = brand.toLowerCase().replace(/\s+/g, "-");
  const brandUrl = `https://errorlib.net/${brandSlug}`;
  let sent = 0;

  for (const email of emails) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: `${brand} documentation is now live on ErrorLib`,
        html: `
          <h2>Good news!</h2>
          <p>The documentation for <strong>${brand}</strong> is now live on ErrorLib.net.</p>
          <p>Browse fault codes, troubleshooting guides, and fix steps:</p>
          <p><a href="${brandUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View ${brand} Fault Codes</a></p>
          <hr>
          <p style="color:#64748b;font-size:12px;">You're receiving this because you requested ${brand} documentation on ErrorLib.net</p>
        `,
      });
      sent++;
    } catch (err) {
      log.warn(`[NOTIFY] Failed to email ${email}: ${err}`);
    }
  }

  log.success(`[NOTIFY] Sent ${sent}/${emails.length} notification emails for ${brand}`);
  return sent;
}
