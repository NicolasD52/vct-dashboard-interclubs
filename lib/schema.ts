import { z } from "zod";

/**
 * Le classement (rankLabel) et le CPPH sont spécifiques à la discipline jouée
 * (simple / double / mixte) : un même joueur peut avoir un rang et un CPPH
 * différents d'un match à l'autre dans la même rencontre. On les snapshote
 * donc par match, jamais au niveau du joueur seul.
 */
export const DisciplineSchema = z.enum(["SH", "SD", "DH", "DD", "DX"]);
export type Discipline = z.infer<typeof DisciplineSchema>;

export const PlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  club: z.string(),
  rankLabel: z.string(),
  cpph: z.number(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const SetScoreSchema = z.object({
  home: z.number(),
  away: z.number(),
});
export type SetScore = z.infer<typeof SetScoreSchema>;

export const MatchSchema = z.object({
  code: z.string(),
  discipline: DisciplineSchema,
  home: z.array(PlayerSchema).min(1).max(2),
  away: z.array(PlayerSchema).min(1).max(2),
  sets: z.array(SetScoreSchema).min(2).max(3),
  winnerSide: z.enum(["home", "away"]),
});
export type Match = z.infer<typeof MatchSchema>;

export const TeamRefSchema = z.object({
  id: z.string(),
  /** Nom du club, sans le numéro d'équipe (ex. « Volant Club Toulousain »). */
  name: z.string(),
  division: z.string(),
  /** Code d'équipe tel qu'affiché par icbad (ex. « 31-VCT-2 »). */
  code: z.string().optional(),
  /**
   * Numéro de l'équipe au sein du club. Indispensable dès qu'un club engage
   * plusieurs équipes : sans lui, deux équipes du même club sont indiscernables.
   */
  number: z.number().optional(),
});
export type TeamRef = z.infer<typeof TeamRefSchema>;

export const RencontreSchema = z.object({
  id: z.string(),
  season: z.string(),
  competition: z.string(),
  date: z.string(),
  venue: z.string().optional(),
  /** Quel côté (home/away) correspond à une équipe du club pour cette rencontre. */
  ourTeamSide: z.enum(["home", "away"]),
  homeTeam: TeamRefSchema,
  awayTeam: TeamRefSchema,
  scoreHome: z.number(),
  scoreAway: z.number(),
  matches: z.array(MatchSchema),
});
export type Rencontre = z.infer<typeof RencontreSchema>;
