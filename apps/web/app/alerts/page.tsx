import { BellRing } from "lucide-react";
import { Card, Pill } from "../../components/ui";
import { alerts } from "../../lib/data";

export default function AlertsPage() {
  return (
    <main className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-900">
            <BellRing className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Notifications</p>
            <h1 className="font-display text-4xl font-semibold">Quota alerts and anomaly detection</h1>
          </div>
        </div>
      </Card>
      <div className="grid gap-4">
        {alerts.map((alert) => (
          <Card key={alert.title} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Pill tone={alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warn" : "default"}>
                  {alert.severity}
                </Pill>
                <p className="mt-3 text-xl font-semibold">{alert.title}</p>
                <p className="mt-2 max-w-3xl text-slate-600">{alert.detail}</p>
              </div>
              <div className="rounded-full border border-black/10 px-4 py-2 text-sm">Slack + Email</div>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}

