# Self-hosted customizations

## Manual collaborator password invitations

This fork can invite collaborators without an email provider. An administrator
creates an invitation in the existing Collaborators screen, copies the generated
single-use link, and sends it to the intended recipient. The recipient chooses a
name and password before receiving access to that repository.

Enable the feature in the production environment:

```dotenv
COLLABORATOR_AUTH_MODE="manual-password"
COLLABORATOR_INVITE_LINK_EXPIRES_IN="86400"
```

`COLLABORATOR_INVITE_LINK_EXPIRES_IN` is measured in seconds and defaults to one
day. Restart the Node.js process after changing either variable.

No additional database migration is needed. The implementation reuses Better
Auth's existing `user` and `account` tables and Pages CMS's existing
`collaborator` and `collaborator_invite` tables.

### Security properties

- Public email/password registration remains disabled.
- A password account can only be created through a valid, unexpired invitation.
- Invitation tokens are single-use and rate-limited at the activation endpoint.
- The activation request must come from the configured `BASE_URL` origin.
- An existing credential password is never replaced by an invitation link.
- Passwords are hashed by Better Auth and are never stored or logged in plain
  text.

### Updating from upstream

Keep `upstream` pointed at the official repository and rebase this branch when a
new Pages CMS release is available:

```bash
git fetch upstream
git checkout feature/manual-password-collaborators
git rebase upstream/main
npm ci
npx tsc --noEmit
npm run lint
```

Most of the custom logic is isolated in
`lib/manual-password-collaborators.ts` and
`components/collaborator-password-activation.tsx`. The small integration points
are `lib/auth.ts`, `lib/actions/collaborator.ts`, the two sign-in pages,
`components/sign-in.tsx`, and `components/collaborators.tsx`.
