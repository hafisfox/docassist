import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

/**
 * Product mark — a neutral "connected nodes" glyph standing in for the outreach
 * graph. Inline SVG rather than an image asset so it inherits `currentColor`
 * and stays crisp in both themes.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Product logo"
      className={cn("size-8 shrink-0 text-primary", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-current opacity-10" />
      <path
        d="M10 21.5V13m0 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 8.5v-5a4 4 0 0 0-4-4h-2m0 0 3-3m-3 3 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="22" r="2" fill="currentColor" />
      <circle cx="10" cy="22" r="2" fill="currentColor" />
    </svg>
  );
}
