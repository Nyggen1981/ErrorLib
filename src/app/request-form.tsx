"use client";

import { useState } from "react";

export function RequestForm() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "created" | "voted" | "error"
  >("idle");
  const [voteCount, setVoteCount] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim()) return;

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

      setBrand("");
      setModel("");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  const showSuccess = status === "created" || status === "voted";

  return (
    <section className="hero-grid bg-technical-800 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-xl font-semibold text-white">
            Missing a manual?
          </h2>
          <p className="mt-2 text-sm text-technical-400">
            Submit a request and our team will prioritize adding it to our
            technical library.
          </p>
        </div>

        {showSuccess ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-success/20 bg-success/10 p-5 text-center">
            <p className="font-medium text-success">
              {status === "voted"
                ? `Thanks! This request now has ${voteCount} votes.`
                : "Thank you! We'll look into it."}
            </p>
            <p className="mt-1 text-sm text-technical-400">
              Popular requests are prioritized by our team.
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-3 text-sm font-medium text-accent transition hover:text-accent/80"
            >
              Submit another request
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
                placeholder="Brand (e.g. Mitsubishi)"
                required
                className="flex-1 rounded-lg border border-technical-600 bg-technical-900 px-4 py-2.5 text-sm text-white placeholder-technical-500 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Model (optional)"
                className="flex-1 rounded-lg border border-technical-600 bg-technical-900 px-4 py-2.5 text-sm text-white placeholder-technical-500 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email (optional — get notified when it's ready)"
                className="flex-1 rounded-lg border border-technical-600 bg-technical-900 px-4 py-2.5 text-sm text-white placeholder-technical-500 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
              <button
                type="submit"
                disabled={status === "loading" || !brand.trim()}
                className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
              >
                {status === "loading" ? "Sending..." : "Request"}
              </button>
            </div>
          </form>
        )}

        {status === "error" && (
          <p className="mt-3 text-center text-sm text-danger">
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </section>
  );
}
