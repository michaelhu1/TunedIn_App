import TabBar from "@/components/tab-bar";

// Shared frame for the signed-in part of the app: a phone-width column and the tab bar.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-md px-5 pb-24 pt-8">{children}</div>
      <TabBar />
    </>
  );
}
