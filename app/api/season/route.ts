import { getOurTeams, getRencontresForTeam, getAllPlayers, loadRencontres } from "@/lib/loadData";
import {
  PERFORMANCE_NEUTRE,
  SEUIL_FIABILITE,
  SIGMA_CPPH,
} from "@/lib/calculations/performanceVsRanking";
import type { TeamRef } from "@/lib/schema";

/**
 * Libellé d'affichage d'une équipe. Un club peut engager plusieurs équipes :
 * sans le numéro, elles seraient toutes affichées sous le même nom.
 */
function teamLabel(team: TeamRef): string {
  return team.number ? `${team.name} ${team.number}` : team.name;
}

export async function GET() {
  // "matches" (l'historique détaillé) n'est pas utilisé par cette page — on ne l'envoie pas au client.
  const players = getAllPlayers().map(({ matches: _matches, ...rest }) => rest);

  const teams = getOurTeams().map((team) => {
    const rencontres = getRencontresForTeam(team.id);
    let w = 0;
    let d = 0;
    let l = 0;
    let matchWins = 0;
    let matchTotal = 0;

    const fixtures = rencontres
      .map((rencontre) => {
        const isHome = rencontre.ourTeamSide === "home";
        const ourScore = isHome ? rencontre.scoreHome : rencontre.scoreAway;
        const theirScore = isHome ? rencontre.scoreAway : rencontre.scoreHome;
        const opponent = isHome ? rencontre.awayTeam : rencontre.homeTeam;
        const result = ourScore > theirScore ? "V" : ourScore < theirScore ? "D" : "N";
        if (result === "V") w++;
        else if (result === "D") l++;
        else d++;
        matchWins += ourScore;
        matchTotal += ourScore + theirScore;

        return {
          date: rencontre.date,
          opponent: teamLabel(opponent),
          venue: isHome ? "Domicile" : "Extérieur",
          score: `${ourScore} – ${theirScore}`,
          result,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const roster = players.filter((p) => p.teamId === team.id);
    const topPlayers = [...roster]
      .filter((p) => p.overall.n >= SEUIL_FIABILITE)
      .sort((a, b) => (b.overall.weighted ?? 0) - (a.overall.weighted ?? 0))
      .slice(0, 6)
      .map((p) => ({
        name: p.name,
        record: `${p.overall.w} – ${p.overall.l}`,
        weighted: p.overall.weighted,
        expectedWins: p.overall.expectedWins,
      }));

    return {
      id: team.id,
      name: teamLabel(team),
      division: team.division,
      w,
      d,
      l,
      matchWins,
      matchTotal,
      rosterSize: roster.length,
      fixtures,
      topPlayers,
    };
  });

  const lastRencontreDate = loadRencontres()
    .map((r) => r.date)
    .sort()
    .at(-1);

  return Response.json({
    teams,
    players,
    lastRencontreDate,
    seuilFiabilite: SEUIL_FIABILITE,
    sigmaCpph: SIGMA_CPPH,
    performanceNeutre: PERFORMANCE_NEUTRE,
  });
}
