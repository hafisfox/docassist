import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sequences",
};

export default function SequencesRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
