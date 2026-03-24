import { cookies } from "next/headers";
import crypto from "crypto";

function makeToken(password: string): string {
  return crypto
    .createHmac("sha256", password)
    .update("errorlib-admin")
    .digest("hex");
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const jar = await cookies();
  const token = jar.get("admin_token")?.value;
  if (!token) return false;

  return token === makeToken(adminPassword);
}
