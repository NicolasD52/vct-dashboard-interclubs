import fs from "node:fs";
import path from "node:path";
import { RencontreSchema, type Rencontre, type TeamRef, type Discipline } from "./schema";
import { computeWeightedWinRate } from "./calculations/weightedWinRate";

const DATA_DIR = path.join(process.cwd(), "data");

function walkJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkJsonFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith(".json")) return [fullPath];
    return [];
  });
}

export function loadRencontres(): Rencontre[] {
  return walkJsonFiles(DATA_DIR).map((file) => {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const result = RencontreSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Données invalides dans ${file}: ${result.error.message}`);
    }
    return result.data;
  });
}

function ourTeam(rencontre: Rencontre): TeamRef {
  return rencontre.ourTeamSide === "home" ? rencontre.homeTeam : rencontre.awayTeam;
}

export function getOurTeams(): TeamRef[] {
  const rencontres = loadRencontres();
  const byId = new Map<string, TeamRef>();
  for (const rencontre of rencontres) {
    const team = ourTeam(rencontre);
    byId.set(team.id, team);
  }
  return [...byId.values()];
}

export function getRencontresForTeam(teamId: string): Rencontre[] {
  return loadRencontres().filter((rencontre) => ourTeam(rencontre).id === teamId);
}

export interface PlayerMatchEntry {
  rencontreId: string;
  date: string;
  playerName: string;
  playerClub: string;
  opponentClub: string;
  discipline: Discipline;
  code: string;
  side: "home" | "away";
  won: boolean;
  playerCpph: number;
  opponentCpph: number;
}

/** Construit, en un seul passage sur toutes les rencontres, la liste des matchs de chaque joueur (clé = playerId). */
function buildPlayerMatchIndex(): Map<string, PlayerMatchEntry[]> {
  const index = new Map<string, PlayerMatchEntry[]>();

  for (const rencontre of loadRencontres()) {
    for (const match of rencontre.matches) {
      const sides = { home: match.home, away: match.away } as const;
      for (const side of ["home", "away"] as const) {
        const opponentSideKey = side === "home" ? "away" : "home";
        const opponentSide = sides[opponentSideKey];
        const opponentCpph =
          opponentSide.reduce((sum, p) => sum + p.cpph, 0) / opponentSide.length;
        const opponentTeam = opponentSideKey === "home" ? rencontre.homeTeam : rencontre.awayTeam;

        for (const player of sides[side]) {
          const entry: PlayerMatchEntry = {
            rencontreId: rencontre.id,
            date: rencontre.date,
            playerName: player.name,
            playerClub: player.club,
            opponentClub: opponentTeam.name,
            discipline: match.discipline,
            code: match.code,
            side,
            won: match.winnerSide === side,
            playerCpph: player.cpph,
            opponentCpph,
          };
          const list = index.get(player.playerId);
          if (list) list.push(entry);
          else index.set(player.playerId, [entry]);
        }
      }
    }
  }

  return index;
}

export function getPlayerMatches(playerId: string): PlayerMatchEntry[] {
  return buildPlayerMatchIndex().get(playerId) ?? [];
}

export type DisciplineBucket = "S" | "D" | "M";

function bucketOf(discipline: Discipline): DisciplineBucket {
  if (discipline === "SH" || discipline === "SD") return "S";
  if (discipline === "DH" || discipline === "DD") return "D";
  return "M";
}

function inferSex(matches: PlayerMatchEntry[]): "F" | "H" | null {
  for (const m of matches) {
    if (m.discipline === "SH" || m.discipline === "DH") return "H";
    if (m.discipline === "SD" || m.discipline === "DD") return "F";
  }
  return null;
}

function summarize(matches: PlayerMatchEntry[]) {
  const n = matches.length;
  const w = matches.filter((m) => m.won).length;
  return {
    n,
    w,
    l: n - w,
    raw: n === 0 ? null : (w / n) * 100,
    weighted: n === 0 ? null : computeWeightedWinRate(matches) * 100,
  };
}

export interface AggregatedPlayer {
  playerId: string;
  name: string;
  club: string;
  teamId: string;
  sex: "F" | "H" | null;
  cpph: number;
  matches: PlayerMatchEntry[];
  overall: ReturnType<typeof summarize>;
  perDiscipline: Record<DisciplineBucket, ReturnType<typeof summarize>>;
}

export function getAllPlayers(): AggregatedPlayer[] {
  const index = buildPlayerMatchIndex();
  const players: AggregatedPlayer[] = [];

  const rencontreOurSide = new Map<string, "home" | "away">();
  const rencontreTeamId = new Map<string, string>();
  for (const rencontre of loadRencontres()) {
    rencontreOurSide.set(rencontre.id, rencontre.ourTeamSide);
    rencontreTeamId.set(rencontre.id, ourTeam(rencontre).id);
  }

  for (const [playerId, allMatches] of index) {
    // Un joueur peut apparaître côté adversaire dans le match d'un autre club : on ne garde
    // que ses apparitions du côté de notre équipe pour ne pas mélanger nos joueurs et les leurs.
    const matches = allMatches.filter((m) => m.side === rencontreOurSide.get(m.rencontreId));
    if (matches.length === 0) continue;

    const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const byBucket: Record<DisciplineBucket, PlayerMatchEntry[]> = { S: [], D: [], M: [] };
    for (const m of matches) byBucket[bucketOf(m.discipline)].push(m);

    players.push({
      playerId,
      name: last.playerName,
      club: last.playerClub,
      teamId: rencontreTeamId.get(last.rencontreId) ?? "",
      sex: inferSex(matches),
      cpph: last.playerCpph,
      matches,
      overall: summarize(matches),
      perDiscipline: {
        S: summarize(byBucket.S),
        D: summarize(byBucket.D),
        M: summarize(byBucket.M),
      },
    });
  }

  return players;
}
