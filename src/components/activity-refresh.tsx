"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HEARTBEAT_MS } from "@/lib/participation-activity";

export function ActivityRefresh() {
  const router = useRouter();
  useEffect(() => {
    const update = () => {
      if (document.visibilityState !== "hidden") router.refresh();
    };
    const timer = window.setInterval(update, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [router]);
  return null;
}
