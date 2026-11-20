import { EntrarScreen } from "@/components/entrar-screen";

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const mode =
    sp.modo === "registro" ? "signup" : sp.modo === "recuperar" ? "reset" : "login";

  return (
    <EntrarScreen
      initialMode={mode}
      next={next}
      urlError={error}
      resetOk={sp.reset === "ok"}
    />
  );
}
