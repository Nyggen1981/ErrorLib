import fs from "fs";
import path from "path";
import { log } from "./logger.js";

const TEMP_DIR = "temp_manuals";
const MAX_PDF_SIZE_MB = 100;

export function ensureTempDir(): string {
  const dir = path.resolve(TEMP_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanTempDir(): void {
  const dir = path.resolve(TEMP_DIR);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    log.detail("Cleaned temp_manuals/ directory");
  }
}

export async function downloadPdf(
  url: string,
  filename?: string
): Promise<string | null> {
  const dir = ensureTempDir();
  const safeName =
    filename ??
    url
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]/g, "_") ??
    "manual.pdf";
  const filePath = path.join(dir, safeName);

  if (fs.existsSync(filePath)) {
    log.detail(`Already downloaded: ${safeName}`);
    return filePath;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.warn(`Download failed (${response.status}): ${url}`);
      return null;
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_PDF_SIZE_MB * 1024 * 1024) {
      log.warn(
        `Skipping ${safeName}: too large (${(parseInt(contentLength) / 1024 / 1024).toFixed(0)} MB)`
      );
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length < 1024) {
      log.warn(`Skipping ${safeName}: file too small, likely not a valid PDF`);
      return null;
    }

    const header = buffer.subarray(0, 5).toString();
    if (header !== "%PDF-") {
      log.warn(`Skipping ${safeName}: not a valid PDF file`);
      return null;
    }

    fs.writeFileSync(filePath, buffer);
    log.success(
      `Downloaded: ${safeName} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`
    );
    return filePath;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort")) {
      log.warn(`Timeout downloading: ${url}`);
    } else {
      log.warn(`Failed to download: ${message}`);
    }
    return null;
  }
}
