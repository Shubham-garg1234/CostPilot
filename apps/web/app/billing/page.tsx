import { Card, Pill } from "../../components/ui";

const invoices = [
  { period: "Apr 2026", raw: "$11,466", markup: "12.5%", total: "$12,899", status: "Open" },
  { period: "Mar 2026", raw: "$10,804", markup: "12.5%", total: "$12,154", status: "Paid" },
  { period: "Feb 2026", raw: "$8,910", markup: "12.5%", total: "$10,024", status: "Paid" }
];

export default function BillingPage() {
  return (
    <main className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="p-6">
        <Pill>Usage-Based Billing</Pill>
        <h1 className="mt-4 font-display text-4xl font-semibold">Meter every token, invoice every org.</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] bg-teal-900 p-5 text-white">
            <p className="text-sm text-white/70">Current cycle estimate</p>
            <p className="mt-3 text-4xl font-semibold">$12,899</p>
            <p className="mt-2 text-sm text-white/70">Includes 12.5% platform markup</p>
          </div>
          <div className="rounded-[24px] bg-white/80 p-5">
            <p className="text-sm text-slate-500">Optimization offset</p>
            <p className="mt-3 text-4xl font-semibold">$3,920</p>
            <p className="mt-2 text-sm text-slate-600">Projected monthly savings if suggestions are accepted</p>
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <p className="text-sm text-slate-500">Recent billing records</p>
        <h2 className="font-display text-2xl font-semibold">Invoices</h2>
        <div className="mt-5 space-y-3">
          {invoices.map((invoice) => (
            <div key={invoice.period} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center rounded-[20px] bg-white/75 px-4 py-3 text-sm">
              <span className="font-medium">{invoice.period}</span>
              <span>{invoice.raw}</span>
              <span>{invoice.markup}</span>
              <span>{invoice.total}</span>
              <Pill>{invoice.status}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
