import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Automations",
};

export default function AutomationsRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
