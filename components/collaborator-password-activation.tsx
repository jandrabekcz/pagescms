"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

type ActivationResult = {
  status: "activated" | "existing_account";
  email: string;
  destinationPath: string;
};

const getResponseMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || "Unable to activate this invitation.";
  } catch {
    return "Unable to activate this invitation.";
  }
};

export function CollaboratorPasswordActivation({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState<ActivationResult | null>(null);

  async function activate() {
    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/collaborator/activate-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });

      if (!response.ok) {
        setError(await getResponseMessage(response));
        return;
      }

      const activation = (await response.json()) as ActivationResult;
      const signInResult = await authClient.signIn.email({
        email: activation.email,
        password,
      });

      if (!signInResult.error) {
        window.location.assign(activation.destinationPath);
        return;
      }

      if (activation.status === "existing_account") {
        setExistingAccount(activation);
        return;
      }

      setError(
        "Your account was activated, but automatic sign-in failed. Sign in with your new password.",
      );
      setExistingAccount(activation);
    } catch {
      setError("Unable to activate this invitation. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (existingAccount) {
    const signInUrl = `/sign-in?email=${encodeURIComponent(existingAccount.email)}&redirect=${encodeURIComponent(existingAccount.destinationPath)}`;
    return (
      <Empty className="absolute inset-0 border-0 rounded-none">
        <EmptyHeader>
          <EmptyTitle>Invitation accepted</EmptyTitle>
          <EmptyDescription>
            This email already has an account. Sign in with its existing password
            to open the repository.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href={signInUrl} className={buttonVariants()}>
            Continue to sign in
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty className="absolute inset-0 border-0 rounded-none">
      <EmptyHeader>
        <EmptyTitle>Accept collaborator invitation</EmptyTitle>
        <EmptyDescription>
          Create a password for your Pages CMS account. The invitation link can
          only be used once.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <form
          className="w-full space-y-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            void activate();
          }}
        >
          <Input
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Name"
            minLength={1}
            maxLength={120}
            required
            disabled={pending}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Password (at least 12 characters)"
            minLength={12}
            maxLength={128}
            required
            disabled={pending}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            type="password"
            name="passwordConfirmation"
            autoComplete="new-password"
            placeholder="Confirm password"
            minLength={12}
            maxLength={128}
            required
            disabled={pending}
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
          />
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            Accept invitation
            {pending ? <Loader className="size-4 animate-spin" /> : null}
          </Button>
        </form>
      </EmptyContent>
    </Empty>
  );
}
