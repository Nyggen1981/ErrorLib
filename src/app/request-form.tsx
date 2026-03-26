"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

export function RequestForm({
  locale,
  defaultBrand = "",
  defaultModel = "",
  compact = false,
  variant = "default",
}: {
  locale: Locale;
  defaultBrand?: string;
  defaultModel?: string;
  compact?: boolean;
  variant?: "default" | "brand";
}) {
  const [brand, setBrand] = useState(defaultBrand);
  const [model, setModel] = useState(defaultModel);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "created" | "voted" | "error"
  >("idle");
  const [voteCount, setVoteCount] = useState(0);

  const isBrandPage = variant === "brand";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim()) return;
    if (isBrandPage && !model.trim()) return;

    setStatus("loading");

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          model: model.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      const data = await res.json();
      if (data.action === "voted") {
        setVoteCount(data.voteCount);
        setStatus("voted");
      } else {
        setStatus("created");
      }

      if (!isBrandPage) setBrand("");
      setModel("");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  const showSuccess = status === "created" || status === "voted";

  if (compact) {
    return (
      <div className="px-5 py-5">
        <p className="mb-1 text-sm font-semibold text-white">
          {t("missingManual", locale)}
        </p>
        <p className="mb-3 text-xs text-technical-400">
          {t("requestSubtitle", locale)}
        </p>

        {showSuccess ? (
          <div className="rounded-lg border border-success/20 bg-success/10 p-3 text-center">
            <p className="text-xs font-medium text-success">
              {status === "voted"
                ? `${t("thankVoted", locale)} ${voteCount} ${t("votes", locale)}.`
                : t("thankCreated", locale)}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder={t("brandPlaceholder", locale)}
                required
                className="flex-1 rounded-md border border-technical-600 bg-technical-800 px-3 py-1.5 text-xs text-white placeholder-technical-400 outline-none transition focus:border-accent"
              />
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("modelPlaceholder", locale)}
                className="flex-1 rounded-md border border-technical-600 bg-technical-800 px-3 py-1.5 text-xs text-white placeholder-technical-400 outline-none transition focus:border-accent"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder", locale)}
                className="flex-1 rounded-md border border-technical-600 bg-technical-800 px-3 py-1.5 text-xs text-white placeholder-technical-400 outline-none transition focus:border-accent"
              />
              <button
                type="submit"
                disabled={status === "loading" || !brand.trim()}
                className="rounded-md bg-accent px-4 py-1.5 text-xs font-bold text-technical-900 transition hover:bg-accent/90 disabled:opacity-50"
              >
                {status === "loading" ? t("sending", locale) : t("requestBtn", locale)}
              </button>
            </div>
          </form>
        )}

        {status === "error" && (
          <p className="mt-2 text-center text-xs text-danger">
            {t("somethingWrong", locale)}
          </p>
        )}
      </div>
    );
  }

  if (variant === "brand") {
    const prompt = t("missingModelPrompt", locale).replace("{brand}", defaultBrand);

    return (
      <div className="mt-10 border-t border-technical-700 pt-8">
        <div className="mx-auto max-w-xl">
          <p className="mb-3 text-sm text-technical-300">{prompt}</p>

          {showSuccess ? (
            <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-center">
              <p className="text-xs font-medium text-success">
                {status === "voted"
                  ? `${t("thankVoted", locale)} ${voteCount} ${t("votes", locale)}.`
                  : t("thankCreated", locale)}
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("modelRequiredPlaceholder", locale)}
                required
                className="flex-1 rounded-lg border border-technical-600 bg-technical-800 px-3 py-2 text-sm text-white placeholder-technical-400 outline-none transition focus:border-accent"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailShort", locale)}
                className="flex-1 rounded-lg border border-technical-600 bg-technical-800 px-3 py-2 text-sm text-white placeholder-technical-400 outline-none transition focus:border-accent"
              />
              <button
                type="submit"
                disabled={status === "loading" || !model.trim()}
                className="shrink-0 rounded-lg bg-accent px-5 py-2 text-sm font-bold text-technical-900 transition hover:bg-accent/90 disabled:opacity-50"
              >
                {status === "loading"
                  ? t("sending", locale)
                  : t("requestBtn", locale)}
              </button>
            </form>
          )}

          {status === "error" && (
            <p className="mt-2 text-center text-xs text-danger">
              {t("somethingWrong", locale)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section id="request" className="hero-grid bg-technical-800 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-xl font-semibold text-white">
            {t("missingManual", locale)}
          </h2>
          <p className="mt-2 text-sm text-technical-400">
            {t("requestSubtitle", locale)}
          </p>
        </div>

        {showSuccess ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-success/20 bg-success/10 p-5 text-center">
            <p className="font-medium text-success">
              {status === "voted"
                ? `${t("thankVoted", locale)} ${voteCount} ${t("votes", locale)}.`
                : t("thankCreated", locale)}
            </p>
            <p className="mt-1 text-sm text-technical-400">
              {t("popularRequests", locale)}
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-3 text-sm font-medium text-accent transition hover:text-accent/80"
            >
              {t("submitAnother", locale)}
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-6 max-w-xl space-y-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder={t("brandPlaceholder", locale)}
                required
                className="flex-1 rounded-lg border border-technical-600 bg-technical-900 px-4 py-2.5 text-sm text-white placeholder-technical-300 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("modelPlaceholder", locale)}
                className="flex-1 rounded-lg border border-technical-600 bg-technical-900 px-4 py-2.5 text-sm text-white placeholder-technical-300 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder", locale)}
                className="flex-1 rounded-lg border border-technical-600 bg-technical-900 px-4 py-2.5 text-sm text-white placeholder-technical-300 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
              <button
                type="submit"
                disabled={status === "loading" || !brand.trim()}
                className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-technical-900 transition hover:bg-accent/90 disabled:opacity-50"
              >
                {status === "loading" ? t("sending", locale) : t("requestBtn", locale)}
              </button>
            </div>
          </form>
        )}

        {status === "error" && (
          <p className="mt-3 text-center text-sm text-danger">
            {t("somethingWrong", locale)}
          </p>
        )}
      </div>
    </section>
  );
}
