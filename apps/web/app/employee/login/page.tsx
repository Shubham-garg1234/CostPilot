import { EmployeeLoginForm } from "../../../components/employee-login-form";

type PageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function EmployeeLoginPage({ searchParams }: PageProps) {
  const { notice } = await searchParams;
  return <EmployeeLoginForm initialNotice={notice} />;
}
