import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campaigns",
};

export default function CampaignsRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
