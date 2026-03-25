"use client";

import { useState } from "react";

export function RequestForm() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
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
    } catch {
      setStatus("error");
    }
  }

  const showSuccess = status === "created" || status === "voted";

  return (
    <section className="mt-16">
      <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-8">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-xl font-semibold text-technical-800">
            Missing a manual?
          </h2>
          <p className="mt-2 text-sm text-technical-500">
            Submit a request and our team will prioritize adding it to our
            technical library.
          </p>
        </div>

        {showSuccess ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-success/30 bg-success/5 p-5 text-center">
            <p className="font-medium text-success">
              {status === "voted"
                ? `Thanks! This request now has ${voteCount} votes.`
                : "Thank you! We'll look into it."}
            </p>
            <p className="mt-1 text-sm text-technical-500">
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
            className="mx-auto mt-6 flex max-w-lg flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Brand (e.g. Mitsubishi)"
              required
              className="flex-1 rounded-lg border border-technical-200 bg-white px-4 py-2.5 text-sm text-technical-800 placeholder-technical-400 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model (optional)"
              className="flex-1 rounded-lg border border-technical-200 bg-white px-4 py-2.5 text-sm text-technical-800 placeholder-technical-400 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
            <button
              type="submit"
              disabled={status === "loading" || !brand.trim()}
              className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {status === "loading" ? "Sending..." : "Request"}
            </button>
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
