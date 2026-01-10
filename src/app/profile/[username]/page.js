import ProfileView from "../profile-view";

export default async function UserProfilePage({ params }) {
  const resolvedParams = await params;
  const username = resolvedParams?.username || "";
  return <ProfileView username={username} />;
}
