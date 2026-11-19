import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicChart from "@/components/public-chart";

export const revalidate = 300;

type Props = { params: Promise<{ school: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await params;
  return {
    title: `${school.toUpperCase()} this week · TunedIn`,
    description: "What this NYU school is listening to this week.",
  };
}

export default async function SchoolChartPage({ params }: Props) {
  const { school } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(school)) notFound();
  return <PublicChart school={school} />;
}
