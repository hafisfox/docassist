"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error: string;
  success?: string;
} | null;

const DEFAULT_REDIRECT = "/dashboard";

/**
 * Only same-origin, absolute paths are allowed as post-login destinations.
 * Anything else (absolute URLs, protocol-relative `//evil.com`, backslash
 * variants that some browsers normalise to `//`) falls back to the dashboard.
 */
function safeRedirect(target: FormDataEntryValue | null): string {
  if (typeof target !== "string" || target.length === 0) return DEFAULT_REDIRECT;
  if (!target.startsWith("/")) return DEFAULT_REDIRECT;
  if (target.startsWith("//") || target.startsWith("/\\")) return DEFAULT_REDIRECT;
  if (target.includes("\\")) return DEFAULT_REDIRECT;
  return target;
}

export async function login(prevState: AuthState, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect(safeRedirect(formData.get("redirect")));
}

export async function signup(prevState: AuthState, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  return { error: "", success: "Check your email to confirm your account." };
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
