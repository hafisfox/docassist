import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Templates",
};

export default function TemplatesRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
