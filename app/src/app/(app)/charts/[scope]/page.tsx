import { notFound } from "next/navigation";
import ChartView from "@/components/chart-view";

// /charts/tandon, /charts/cas, ... One page per school, addressed by its slug.
export default async function SchoolChartsPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(scope)) notFound();
  return <ChartView school={scope} />;
}
