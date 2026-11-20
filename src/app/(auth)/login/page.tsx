import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (typeof sp.next === "string") params.set("next", sp.next);
  if (typeof sp.error === "string") params.set("error", sp.error);
  if (typeof sp.reset === "string") params.set("reset", sp.reset);
  const qs = params.toString();
  redirect(qs ? `/entrar?${qs}` : "/entrar");
}
