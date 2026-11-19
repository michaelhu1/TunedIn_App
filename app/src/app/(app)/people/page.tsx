import { redirect } from "next/navigation";

// The People tab was folded into Home. This keeps any old link or bookmark working.
export default function PeoplePage() {
  redirect("/home");
}
