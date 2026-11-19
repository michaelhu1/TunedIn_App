import type { Metadata } from "next";
import PublicChart from "@/components/public-chart";

// Rebuilt at most every five minutes, however many people open it, so a link going around
// a group chat cannot hammer the database.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "NYU this week · TunedIn",
  description: "The songs and artists NYU students are listening to this week.",
};

export default function NyuChartPage() {
  return <PublicChart school={null} />;
}
