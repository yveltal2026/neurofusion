"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { StudyTabs, studyTabForRoute, type TabsVariant } from "./study-tabs";

export function ActiveStudyTabs({ id, variant }: { id: string; variant: TabsVariant }) {
  const section = usePathname().split("/")[3];
  const views = useSearchParams().getAll("view");
  return <StudyTabs id={id} active={studyTabForRoute(section, views.length === 1 ? views[0] : undefined)} variant={variant} />;
}
