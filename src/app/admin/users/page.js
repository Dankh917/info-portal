import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import authOptions from "@/auth";
import AdminUsersClient from "./admin-users-client";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  if (session.user?.role !== "admin") {
    redirect("/");
  }

  return <AdminUsersClient />;
}
