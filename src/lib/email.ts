import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = "kjetilnygard@hotmail.com";
const FROM_ADDRESS = "ErrorLib <notifications@errorlib.net>";

export async function sendAdminAlert(
  brand: string,
  model: string | null,
  userEmail: string | null
) {
  try {
    await resend.emails.send({
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

export async function sendBrandLiveNotification(
  brand: string,
  emails: string[]
) {
  if (emails.length === 0) return;

  const brandSlug = brand.toLowerCase().replace(/\s+/g, "-");
  const brandUrl = `https://errorlib.net/${brandSlug}`;

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
    } catch (err) {
      console.warn(`[EMAIL] Failed to notify ${email}:`, err);
    }
  }
}
