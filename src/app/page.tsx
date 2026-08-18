import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";

export default async function HomePage() {
  const user = await currentUser();
  redirect(user ? "/mail" : "/login");
}
