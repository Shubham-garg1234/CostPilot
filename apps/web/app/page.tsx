import { DashboardOverview } from "../components/dashboard-overview";
import { DemoModePanel } from "../components/demo-mode-panel";
import { ProxyPlayground } from "../components/proxy-playground";

export default function HomePage() {
  return (
    <main className="space-y-6">
      <DashboardOverview />
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <DemoModePanel />
        <ProxyPlayground />
      </section>
    </main>
  );
}
