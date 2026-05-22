import { EmployeeResetPasswordForm } from "../../../components/employee-reset-password-form";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function EmployeeResetPasswordPage({ searchParams }: PageProps) {
  const { token = "" } = await searchParams;
  return <EmployeeResetPasswordForm initialToken={token} />;
}
