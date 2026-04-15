import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      isTestUser: boolean;
      onboardingComplete: boolean;
      /** True while the user has authenticated via OAuth but hasn't yet completed
       *  onboarding. No DB User record exists yet in this state. */
      pendingOnboarding: boolean;
      /** Pending onboarding fields — only populated when pendingOnboarding is true.
       *  Passed through the session so the complete route doesn't need getToken(). */
      pendingEmail?: string;
      pendingName?: string | null;
      pendingImage?: string | null;
      pendingAccount?: {
        type: string;
        provider: string;
        providerAccountId: string;
        access_token?: string | null;
        expires_at?: number | null;
        id_token?: string | null;
        refresh_token?: string | null;
        token_type?: string | null;
        scope?: string | null;
        session_state?: string | null;
      } | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
    isTestUser?: boolean;
    onboardingComplete?: boolean;
    pendingOnboarding?: boolean;
    /** Google profile fields stored before onboarding completes (no DB row yet) */
    pendingEmail?: string;
    pendingName?: string | null;
    pendingImage?: string | null;
    /** OAuth account data stored before the Account row is created */
    pendingAccount?: {
      type: string;
      provider: string;
      providerAccountId: string;
      access_token?: string | null;
      expires_at?: number | null;
      id_token?: string | null;
      refresh_token?: string | null;
      token_type?: string | null;
      scope?: string | null;
      session_state?: string | null;
    } | null;
  }
}
