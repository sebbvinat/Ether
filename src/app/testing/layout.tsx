import { TestingSidebar } from "@/components/testing/TestingSidebar";
import { BackgroundPrefetch } from "@/components/testing/BackgroundPrefetch";

export const metadata = {
  title: "Ether — Testing",
};

export default function TestingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-tv-bg">
      <TestingSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      {/* Corre en background — cachea velas de símbolos populares mientras
          estás en cualquier ruta de /testing. */}
      <BackgroundPrefetch />
    </div>
  );
}
