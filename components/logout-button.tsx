"use client";

import { useState } from "react";
import { useRoutines } from "@/lib/routine-context";

export function LogoutButton({ className }: { className: string }) {
  const { logout } = useRoutines();
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await logout();
    } finally {
      setPending(false);
    }
  };

  return (
    <button className={className} type="button" onClick={() => void handleLogout()} disabled={pending}>
      {pending ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}
