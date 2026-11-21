import { Suspense } from "react";
import { StudyNavigation } from "@/components/study-navigation";
import { WorkspaceFrame } from "@/components/workspace-appearance";

export default async function StudyLayout({ children, params }: LayoutProps<"/studies/[id]">) {
  const { id } = await params;
  return (
    <WorkspaceFrame studyNav={<Suspense><StudyNavigation id={id} /></Suspense>}>
      {children}
    </WorkspaceFrame>
  );
}
