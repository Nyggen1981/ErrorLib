import { Resend } from "resend";

const ADMIN_EMAIL = "kjetilnygard@hotmail.com";
const FROM_ADDRESS = "ErrorLib <notifications@errorlib.net>";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

export async function sendAdminAlert(
  brand: string,
  model: string | null,
  userEmail: string | null
) {
  try {
    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAIL,
      subject: `New Brand Request: ${brand}`,
      html: `
        <h2>New Brand Request</h2>
        <p><strong>Brand:</strong> ${brand}</p>
        ${model ? `<p><strong>Model:</strong> ${model}</p>` : ""}
        ${userEmail ? `<p><strong>User Email:</strong> ${userEmail}</p>` : "<p><em>No email provided</em></p>"}
        <hr>
        <p style="color:#64748b;font-size:12px;">Sent from ErrorLib Admin Notifications</p>
      `,
    });
  } catch (err) {
    console.warn("[EMAIL] Failed to send admin alert:", err);
  }
}

export async function sendBrokenLinksAlert(
  broken: { brand: string; manual: string; url: string }[]
) {
  if (broken.length === 0) return;
  try {
    const rows = broken
      .map(
        (b) =>
          `<tr><td style="padding:4px 8px;border:1px solid #333">${b.brand}</td><td style="padding:4px 8px;border:1px solid #333">${b.manual}</td><td style="padding:4px 8px;border:1px solid #333;font-size:11px;word-break:break-all">${b.url}</td></tr>`
      )
      .join("");
    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAIL,
      subject: `ErrorLib: ${broken.length} broken PDF link${broken.length > 1 ? "s" : ""} detected`,
      html: `
        <h2 style="color:#ef4444">Broken PDF Links Detected</h2>
        <p>${broken.length} manual PDF link${broken.length > 1 ? "s" : ""} returned errors during the health check.</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
          <tr style="background:#1e1e1e;color:#ededed">
            <th style="padding:6px 8px;text-align:left;border:1px solid #333">Brand</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid #333">Manual</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid #333">URL</th>
          </tr>
          ${rows}
        </table>
        <p>Log in to the <a href="https://errorlib.net/admin">Admin Dashboard</a> to fix or replace these URLs.</p>
        <hr>
        <p style="color:#64748b;font-size:12px;">ErrorLib Health Monitor</p>
      `,
    });
  } catch (err) {
    console.warn("[EMAIL] Failed to send broken links alert:", err);
  }
}

export async function sendBrandLiveNotification(
  brand: string,
  emails: string[]
) {
  if (emails.length === 0) return;

  const brandSlug = brand.toLowerCase().replace(/\s+/g, "-");
  const brandUrl = `https://errorlib.net/${brandSlug}`;

  for (const email of emails) {
    try {
      await getResend().emails.send({
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
    } catch (err) {
      console.warn(`[EMAIL] Failed to notify ${email}:`, err);
    }
  }
}
