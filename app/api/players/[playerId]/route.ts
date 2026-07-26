import { getPlayerMatches } from "@/lib/loadData";
import { computeWeightedWinRate } from "@/lib/calculations/weightedWinRate";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/players/[playerId]">
) {
  const { playerId } = await ctx.params;
  const matches = getPlayerMatches(playerId);

  if (matches.length === 0) {
    return Response.json({ error: "Joueur introuvable" }, { status: 404 });
  }

  const weightedWinRate = computeWeightedWinRate(
    matches.map((m) => ({ sideCpph: m.sideCpph, opponentCpph: m.opponentCpph, won: m.won }))
  );

  return Response.json({
    playerId,
    name: matches[0].playerName,
    club: matches[0].playerClub,
    weightedWinRate,
    matches,
  });
}
