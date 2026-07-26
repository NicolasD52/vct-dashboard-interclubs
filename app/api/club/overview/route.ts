import { getOurTeams, getRencontresForTeam } from "@/lib/loadData";

export async function GET() {
  const teams = getOurTeams().map((team) => {
    const rencontres = getRencontresForTeam(team.id);
    let won = 0;
    let lost = 0;

    for (const rencontre of rencontres) {
      const ourScore = rencontre.ourTeamSide === "home" ? rencontre.scoreHome : rencontre.scoreAway;
      const theirScore = rencontre.ourTeamSide === "home" ? rencontre.scoreAway : rencontre.scoreHome;
      if (ourScore > theirScore) won += 1;
      else if (ourScore < theirScore) lost += 1;
    }

    return {
      team,
      played: rencontres.length,
      won,
      lost,
      drawn: rencontres.length - won - lost,
    };
  });

  return Response.json({ teams });
}
