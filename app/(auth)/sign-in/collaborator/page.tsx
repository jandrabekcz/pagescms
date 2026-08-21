import { InviteSignIn } from "@/components/invite-sign-in";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { CollaboratorPasswordActivation } from "@/components/collaborator-password-activation";
import { isManualPasswordCollaboratorAuthEnabled } from "@/lib/manual-password-collaborators";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token?.trim()) {
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Invite unavailable</EmptyTitle>
          <EmptyDescription>This invitation link is invalid.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return isManualPasswordCollaboratorAuthEnabled() ? (
    <CollaboratorPasswordActivation token={token.trim()} />
  ) : (
    <InviteSignIn token={token.trim()} />
  );
}
