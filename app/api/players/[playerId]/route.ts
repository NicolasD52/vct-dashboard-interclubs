import { getPlayerMatches } from "@/lib/loadData";
import {
  computeExpectedWins,
  computePerformanceVsRanking,
} from "@/lib/calculations/performanceVsRanking";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/players/[playerId]">
) {
  const { playerId } = await ctx.params;
  const matches = getPlayerMatches(playerId);

  if (matches.length === 0) {
    return Response.json({ error: "Joueur introuvable" }, { status: 404 });
  }

  const inputs = matches.map((m) => ({
    sideCpph: m.sideCpph,
    opponentCpph: m.opponentCpph,
    won: m.won,
  }));

  return Response.json({
    playerId,
    name: matches[0].playerName,
    club: matches[0].playerClub,
    wins: matches.filter((m) => m.won).length,
    expectedWins: computeExpectedWins(inputs),
    /** 100 = exactement au niveau de son classement. */
    performanceVsRanking: computePerformanceVsRanking(inputs),
    matches,
  });
}
