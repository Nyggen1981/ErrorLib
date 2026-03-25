"use client";

import { useState } from "react";
import { FaultCodeCard } from "./FaultCodeCard";

export type SeriesFaultItem = {
  id: string;
  code: string;
  title: string;
  description: string;
  href: string;
  tag: string;
};

type Props = {
  items: SeriesFaultItem[];
  tags: string[];
  allLabel: string;
};

export function SeriesFaultList({ items, tags, allLabel }: Props) {
  const [active, setActive] = useState<string | null>(null);

  const visible = active ? items.filter((i) => i.tag === active) : items;

  return (
    <>
      {tags.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActive(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              active === null
                ? "border-accent bg-accent/15 text-accent"
                : "border-technical-600 text-technical-300 hover:border-technical-500 hover:text-technical-100"
            }`}
          >
            {allLabel}
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActive(active === tag ? null : tag)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active === tag
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-technical-600 text-technical-300 hover:border-technical-500 hover:text-technical-100"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-technical-600 p-10 text-center">
          <p className="text-technical-300">No fault codes match this filter.</p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {visible.map((item) => (
            <FaultCodeCard
              key={item.id}
              code={item.code}
              title={item.title}
              description={item.description}
              href={item.href}
            />
          ))}
        </div>
      )}
    </>
  );
}
