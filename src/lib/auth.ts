import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// The default PrismaAdapter sends `name` from Google's profile, but our
// User model uses `googleAccountName` instead. We also need to check for
// the superuser email and set role accordingly on creation.
const baseAdapter = PrismaAdapter(prisma);
const adapter = {
  ...baseAdapter,
  createUser: async (data: Record<string, unknown>) => {
    const email = data.email as string | undefined;
    const isSuperuser = email === process.env.SUPERUSER_EMAIL;

    return prisma.user.create({
      data: {
        email: email ?? "",
        image: (data.image as string) ?? undefined,
        googleAccountName: (data.name as string) ?? undefined,
        role: isSuperuser ? "superuser" : "user",
        onboardingComplete: false,
        isTestUser: false,
      },
    });
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
    async jwt({ token, user }) {
      if (user) {
        // The adapter already created/found the user and linked the account.
        // Just look up the full DB record to populate the JWT.
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.isTestUser = dbUser.isTestUser;
          token.onboardingComplete = dbUser.onboardingComplete;
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
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
});
