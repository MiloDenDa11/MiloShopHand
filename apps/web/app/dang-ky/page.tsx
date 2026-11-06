import { Suspense } from "react";
import { AuthForm } from "../../components/account";
export const metadata = { title: "T?i kho?n", robots: { index: false } };
export default function Page() {
  return (
    <Suspense fallback={<p>?ang t?i?</p>}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
