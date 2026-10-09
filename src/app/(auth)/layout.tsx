export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <main className="flex flex-1 items-center justify-center px-6 py-16">{children}</main>;
}
