import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

const baseAdapter = PrismaAdapter(prisma);

/**
 * Customised adapter that defers User + Account creation until onboarding
 * is complete. On the first OAuth sign-in for a new user:
 *  - createUser: returns a virtual user object (no DB write)
 *  - linkAccount: no-op (no DB write)
 * The JWT callback stores Google profile + OAuth token data in the JWT.
 * The /api/onboarding/complete endpoint creates both rows once the user
 * has linked their Activate account and entered their real name.
 */
const adapter = {
  ...baseAdapter,

  createUser: async (data: Record<string, unknown>) => {
    // Return a virtual user without writing to the DB. The JWT callback
    // will detect the absence of a real DB record and set pendingOnboarding.
    return {
      id: "pending",
      email: (data.email as string) ?? "",
      name: (data.name as string) ?? null,
      image: (data.image as string) ?? null,
      emailVerified: null,
    };
  },

  linkAccount: async () => {
    // No-op: Account is created later in /api/onboarding/complete once the
    // user has finished the onboarding flow.
    return undefined;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: adapter as never,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    newUser: "/onboarding",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Sign-in event: both `user` and `account` are present
      if (user) {
        const email = user.email;
        if (email) {
          const dbUser = await prisma.user.findUnique({ where: { email } });

          if (dbUser) {
            // Returning user — real DB record exists, populate token normally
            return {
              ...token,
              userId: dbUser.id,
              role: dbUser.role,
              isTestUser: dbUser.isTestUser,
              onboardingComplete: dbUser.onboardingComplete,
              pendingOnboarding: false,
              // Clear any stale pending data from a previous abandoned onboarding
              pendingEmail: undefined,
              pendingName: undefined,
              pendingImage: undefined,
              pendingAccount: undefined,
            };
          }

          // New user — store Google profile + OAuth data in JWT without creating DB rows
          return {
            ...token,
            pendingOnboarding: true,
            pendingEmail: email,
            pendingName: user.name ?? null,
            pendingImage: user.image ?? null,
            pendingAccount: account
              ? {
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  access_token: account.access_token ?? null,
                  expires_at: account.expires_at ?? null,
                  id_token: account.id_token ?? null,
                  refresh_token: account.refresh_token ?? null,
                  token_type: account.token_type ?? null,
                  scope: account.scope ?? null,
                  session_state: (account.session_state as string) ?? null,
                }
              : null,
            // Clear any real-user fields
            userId: undefined,
            role: undefined,
            isTestUser: undefined,
            onboardingComplete: undefined,
          };
        }
      }

      // Not a sign-in event: check if a pending user has since completed onboarding
      if (token.pendingOnboarding && token.pendingEmail) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.pendingEmail },
        });

        if (dbUser?.onboardingComplete) {
          // Onboarding complete — upgrade token to a real session
          const { pendingEmail, pendingName, pendingImage, pendingAccount, ...rest } = token;
          void pendingEmail; void pendingName; void pendingImage; void pendingAccount;
          return {
            ...rest,
            userId: dbUser.id,
            role: dbUser.role,
            isTestUser: dbUser.isTestUser,
            onboardingComplete: true,
            pendingOnboarding: false,
          };
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token.pendingOnboarding) {
        session.user.pendingOnboarding = true;
        session.user.id = "";
        session.user.role = "user";
        session.user.isTestUser = false;
        session.user.onboardingComplete = false;
        session.user.pendingEmail = token.pendingEmail;
        session.user.pendingName = token.pendingName;
        session.user.pendingImage = token.pendingImage;
        session.user.pendingAccount = token.pendingAccount;
      } else {
        session.user.pendingOnboarding = false;
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.isTestUser = token.isTestUser as boolean;
        session.user.onboardingComplete = token.onboardingComplete as boolean;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
});
