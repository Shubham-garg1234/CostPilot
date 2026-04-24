import { DashboardOverview } from "../components/dashboard-overview";
import { ProxyPlayground } from "../components/proxy-playground";

export default function HomePage() {
  return (
    <main className="space-y-6">
      <DashboardOverview />
      <ProxyPlayground />
    </main>
  );
}
