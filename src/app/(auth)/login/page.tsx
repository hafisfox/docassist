"use client";

import { Suspense, useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { login, signup, type AuthState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "";
  const [isSignUp, setIsSignUp] = useState(false);

  const action = isSignUp ? signup : login;
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(action, null);

  useEffect(() => {
    if (!state) return;

    if (state.error) {
      toast.error(state.error);
    }

    if ("success" in state && state.success) {
      toast.success(state.success);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex items-center gap-2">
          <img
            src="/logo.webp"
            alt="DoctorAssist.AI logo"
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-lg object-cover"
          />
          <span className="text-lg font-semibold tracking-tight">
            DoctorAssist.AI
          </span>
        </div>
        <CardTitle>{isSignUp ? "Create an account" : "Welcome back"}</CardTitle>
        <CardDescription>
          {isSignUp
            ? "Enter your email to create your account"
            : "Sign in to your account to continue"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="redirect" value={redirectTo} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={isSignUp ? "Min. 8 characters" : "Enter your password"}
              required
              minLength={isSignUp ? 8 : undefined}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>

          <Button type="submit" size="lg" disabled={isPending} className="mt-1">
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isSignUp ? (
              "Sign Up"
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </CardFooter>
    </Card>
  );
}
