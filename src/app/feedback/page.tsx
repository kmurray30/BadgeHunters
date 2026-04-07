import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { FeedbackClient } from "./feedback-client";

export default async function FeedbackPage() {
  const user = await requireUser();
  const isolation = isolationFilter(user);

  // All users can submit feedback; only superusers can view the dashboard
  const feedbackPosts = user.role === "superuser"
    ? await prisma.feedbackPost.findMany({
        where: { author: isolation },
        orderBy: { createdAt: "desc" },
        include: {
          author: {
            select: {
              id: true,
              activatePlayerName: true,
              realName: true,
              displayNameMode: true,
              image: true,
            },
          },
          reactions: {
            include: {
              user: { select: { id: true } },
            },
          },
        },
      })
    : [];

  // Get the current user's own feedback posts regardless
  const myPosts = await prisma.feedbackPost.findMany({
    where: { authorUserId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: {
          id: true,
          activatePlayerName: true,
          realName: true,
          displayNameMode: true,
          image: true,
        },
      },
      reactions: {
        include: {
          user: { select: { id: true } },
        },
      },
    },
  });

  function getDisplayName(appUser: { displayNameMode: string; realName: string | null; activatePlayerName: string | null }) {
    return appUser.displayNameMode === "real_name"
      ? appUser.realName ?? appUser.activatePlayerName ?? "Unknown"
      : appUser.activatePlayerName ?? appUser.realName ?? "Unknown";
  }

  const allPosts = user.role === "superuser" ? feedbackPosts : myPosts;

  const serializedPosts = allPosts.map((post) => ({
    id: post.id,
    body: post.body,
    status: post.status,
    editedAt: post.editedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    author: {
      id: post.author.id,
      displayName: getDisplayName(post.author),
      image: post.author.image,
    },
    reactions: post.reactions.map((reaction) => ({
      id: reaction.id,
      reactionType: reaction.reactionType,
      userId: reaction.user.id,
    })),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <FeedbackClient
        posts={serializedPosts}
        currentUserId={user.id}
        isSuperuser={user.role === "superuser"}
      />
    </div>
  );
}
