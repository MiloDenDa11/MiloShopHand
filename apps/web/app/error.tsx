"use client";
import { ErrorBox } from "../components/client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="container section">
      <ErrorBox
        message="Không thể tải nội dung. Vui lòng thử lại."
        retry={reset}
      />
    </div>
  );
}
