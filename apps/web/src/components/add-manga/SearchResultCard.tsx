import type { RefCallback } from "react";
import { useApiClient } from "../../api/context";
import type { SearchResult } from "./types";
import { cn } from "@/lib/utils";

interface SearchResultCardProps {
  result: SearchResult;
  onClick: (manga: SearchResult) => void;
  isFocused: boolean;
  cardRef: RefCallback<HTMLDivElement>;
  onFocus: () => void;
}

export function SearchResultCard({
  result,
  onClick,
  isFocused,
  cardRef,
  onFocus,
}: SearchResultCardProps) {
  const api = useApiClient();
  const firstLetter = result.title.charAt(0).toUpperCase();
  const coverUrl = api.getAssetUrl(result.coverImageUrl);

  return (
    <div
      className={cn(
        "group cursor-pointer rounded-xl outline-none ring-offset-2 ring-offset-background transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring",
        isFocused && "ring-2 ring-primary/60",
      )}
      ref={cardRef}
      onClick={() => onClick(result)}
      role="button"
      tabIndex={0}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(result);
        }
      }}
    >
      <div className="aspect-[2/3] overflow-hidden rounded-xl border border-border/70 bg-secondary shadow-sm">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={result.title}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 to-secondary text-3xl font-bold text-muted-foreground">
            {firstLetter}
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">
        {result.title}
      </p>
    </div>
  );
}
