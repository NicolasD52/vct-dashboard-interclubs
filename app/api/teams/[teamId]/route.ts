import { getRencontresForTeam } from "@/lib/loadData";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/teams/[teamId]">
) {
  const { teamId } = await ctx.params;
  const rencontres = getRencontresForTeam(teamId);

  if (rencontres.length === 0) {
    return Response.json({ error: "Équipe introuvable ou sans rencontre" }, { status: 404 });
  }

  const team = rencontres[0].ourTeamSide === "home" ? rencontres[0].homeTeam : rencontres[0].awayTeam;

  const results = rencontres
    .map((rencontre) => {
      const opponent = rencontre.ourTeamSide === "home" ? rencontre.awayTeam : rencontre.homeTeam;
      const ourScore = rencontre.ourTeamSide === "home" ? rencontre.scoreHome : rencontre.scoreAway;
      const theirScore = rencontre.ourTeamSide === "home" ? rencontre.scoreAway : rencontre.scoreHome;

      return {
        rencontreId: rencontre.id,
        date: rencontre.date,
        opponent: opponent.name,
        division: rencontre.homeTeam.division,
        ourScore,
        theirScore,
        result: ourScore > theirScore ? "won" : ourScore < theirScore ? "lost" : "draw",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return Response.json({ team, rencontres: results });
}
