import { Suspense } from "react";
import { PasswordRecovery } from '../../components/password-recovery';
export const metadata = { title: 'Khôi phục tài khoản', robots: { index: false } };
export default function Page() {
  return (
    <Suspense fallback={<p>Đang tải…</p>}>
      <PasswordRecovery />
    </Suspense>
  );
}
