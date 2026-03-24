import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-0 overflow-hidden">
      {/* Conversation list */}
      <div className="flex w-80 shrink-0 flex-col gap-2 border-r p-3">
        <Skeleton className="h-8 w-full rounded-lg" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      {/* Message thread */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="flex flex-1 flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-14 w-2/3 rounded-xl ${i % 2 === 0 ? "self-start" : "self-end"}`}
            />
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}
