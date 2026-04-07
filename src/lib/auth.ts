import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as never,
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
      if (user) {
        // First login — look up or create the DB user
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (existingUser) {
          token.userId = existingUser.id;
          token.role = existingUser.role;
          token.isTestUser = existingUser.isTestUser;
          token.onboardingComplete = existingUser.onboardingComplete;
        } else {
          // Auto-elevate the configured superuser email
          const isSuperuser = user.email === process.env.SUPERUSER_EMAIL;
          const newUser = await prisma.user.create({
            data: {
              email: user.email!,
              authType: "google",
              role: isSuperuser ? "superuser" : "user",
              googleAccountName: user.name ?? undefined,
              image: user.image ?? undefined,
              isTestUser: false,
              onboardingComplete: false,
            },
          });

          // Link the OAuth account
          if (account) {
            await prisma.account.create({
              data: {
                userId: newUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                refresh_token: account.refresh_token ?? null,
                access_token: account.access_token ?? null,
                expires_at: account.expires_at ?? null,
                token_type: account.token_type ?? null,
                scope: account.scope ?? null,
                id_token: account.id_token ?? null,
              },
            });
          }

          token.userId = newUser.id;
          token.role = newUser.role;
          token.isTestUser = false;
          token.onboardingComplete = false;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.isTestUser = token.isTestUser as boolean;
        session.user.onboardingComplete = token.onboardingComplete as boolean;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // After sign-in, redirect to onboarding if not complete
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
});
