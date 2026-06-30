import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ playerId?: string }>;
}

export default async function MyScoresRedirectPage({ searchParams }: Props) {
  const { playerId } = await searchParams;
  const query = playerId
    ? `?playerId=${encodeURIComponent(playerId)}`
    : "";
  redirect(`/levels/scores${query}`);
}
