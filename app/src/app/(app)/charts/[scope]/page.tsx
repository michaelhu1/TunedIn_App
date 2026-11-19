import { notFound } from "next/navigation";
import ChartView from "@/components/chart-view";
import FriendsChartView from "@/components/friends-chart-view";

// /charts/friends, /charts/tandon, /charts/cas, ... One page per category.
export default async function SchoolChartsPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(scope)) notFound();
  // "friends" is a category of its own; every other value is a school.
  if (scope === "friends") return <FriendsChartView />;
  return <ChartView school={scope} />;
}
