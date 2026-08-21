import "server-only";

import { APIError, createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  collaboratorInviteTable,
  collaboratorTable,
} from "@/db/schema";

const MANUAL_PASSWORD_MODE = "manual-password";

export const isManualPasswordCollaboratorAuthEnabled = () =>
  process.env.COLLABORATOR_AUTH_MODE?.trim().toLowerCase() ===
  MANUAL_PASSWORD_MODE;

const activationBodySchema = z.object({
  token: z.string().trim().min(20).max(256),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getPendingInvite = async (token: string) => {
  const invite = await db.query.collaboratorInviteTable.findFirst({
    where: eq(collaboratorInviteTable.token, token),
  });

  if (!invite) return null;

  if (invite.expiresAt <= new Date()) {
    await db
      .delete(collaboratorInviteTable)
      .where(eq(collaboratorInviteTable.id, invite.id));
    return null;
  }

  const collaborator = await db.query.collaboratorTable.findFirst({
    where: and(
      sql`lower(${collaboratorTable.email}) = lower(${invite.email})`,
      sql`lower(${collaboratorTable.owner}) = lower(${invite.owner})`,
      sql`lower(${collaboratorTable.repo}) = lower(${invite.repo})`,
    ),
  });

  if (!collaborator) {
    await db
      .delete(collaboratorInviteTable)
      .where(eq(collaboratorInviteTable.id, invite.id));
    return null;
  }

  return { invite, collaborator };
};

const assertSameOrigin = (origin: string | null, baseUrl: string) => {
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(baseUrl).origin;
  } catch {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Invalid authentication base URL.",
    });
  }

  if (!origin || origin !== expectedOrigin) {
    throw new APIError("FORBIDDEN", {
      message: "Invalid activation request origin.",
    });
  }
};

export const manualPasswordCollaborators = () =>
  ({
    id: "manual-password-collaborators",
    endpoints: {
      activateCollaboratorPassword: createAuthEndpoint(
        "/collaborator/activate-password",
        {
          method: "POST",
          requireHeaders: true,
          body: activationBodySchema,
        },
        async (ctx) => {
          if (!isManualPasswordCollaboratorAuthEnabled()) {
            throw new APIError("NOT_FOUND", {
              message: "Password activation is not enabled.",
            });
          }

          assertSameOrigin(ctx.headers.get("origin"), ctx.context.baseURL);

          const pending = await getPendingInvite(ctx.body.token);
          if (!pending) {
            throw new APIError("BAD_REQUEST", {
              message: "This invitation is invalid or has expired.",
            });
          }

          const { invite, collaborator } = pending;
          const email = normalizeEmail(invite.email);
          const existing = await ctx.context.internalAdapter.findUserByEmail(
            email,
            { includeAccounts: true },
          );

          let user = existing?.user;
          const hasCredentialAccount = Boolean(
            existing?.accounts.some(
              (account) => account.providerId === "credential",
            ),
          );

          if (!user) {
            const passwordHash = await ctx.context.password.hash(
              ctx.body.password,
            );
            user = await ctx.context.internalAdapter.createUser({
              email,
              name: ctx.body.name,
              emailVerified: true,
            });
            await ctx.context.internalAdapter.linkAccount({
              userId: user.id,
              providerId: "credential",
              accountId: user.id,
              password: passwordHash,
            });
          } else if (!hasCredentialAccount) {
            const passwordHash = await ctx.context.password.hash(
              ctx.body.password,
            );
            await ctx.context.internalAdapter.linkAccount({
              userId: user.id,
              providerId: "credential",
              accountId: user.id,
              password: passwordHash,
            });
            if (!user.emailVerified) {
              user = await ctx.context.internalAdapter.updateUser(user.id, {
                emailVerified: true,
              });
            }
          }

          await db.transaction(async (tx) => {
            const claimed = await tx
              .update(collaboratorTable)
              .set({ userId: user!.id })
              .where(eq(collaboratorTable.id, collaborator.id))
              .returning({ id: collaboratorTable.id });

            if (claimed.length !== 1) {
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "Unable to activate this collaborator.",
              });
            }

            await tx
              .delete(collaboratorInviteTable)
              .where(eq(collaboratorInviteTable.id, invite.id));
          });

          return ctx.json({
            status: hasCredentialAccount
              ? ("existing_account" as const)
              : ("activated" as const),
            email,
            destinationPath: `/${invite.owner}/${invite.repo}`,
          });
        },
      ),
    },
    rateLimit: [
      {
        window: 60,
        max: 5,
        pathMatcher: (path) =>
          path === "/collaborator/activate-password",
      },
    ],
  }) satisfies BetterAuthPlugin;
