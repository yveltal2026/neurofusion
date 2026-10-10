import { Bubbles } from "@/components/brand/bubbles";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative isolate flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <Bubbles className="pointer-events-none absolute -bottom-4 -left-4 -z-10 w-28 sm:w-40" />
      {children}
    </main>
  );
}
