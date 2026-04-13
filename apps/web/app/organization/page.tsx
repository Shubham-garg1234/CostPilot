import { DemoModePanel } from "../../components/demo-mode-panel";
import { OrganizationManager } from "../../components/organization-manager";

export default function OrganizationPage() {
  return (
    <main className="space-y-6">
      <DemoModePanel />
      <OrganizationManager />
    </main>
  );
}
