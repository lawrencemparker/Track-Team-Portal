import type { ReactNode } from "react";
import LoginPageClient from "./LoginPageClient";

export const dynamic = "force-dynamic";

export default function LoginPage(): ReactNode {
  return <LoginPageClient />;
}
