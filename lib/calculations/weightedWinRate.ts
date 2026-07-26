export interface WeightedMatchInput {
  playerCpph: number;
  opponentCpph: number;
  won: boolean;
}

/** Écart CPPH pour lequel la probabilité de victoire attendue passe à 90%. */
export const SIGMA_CPPH = 200;
/** Nombre de matchs minimum pour considérer un indice comme fiable. */
export const SEUIL_FIABILITE = 8;

/** Probabilité de victoire attendue d'un joueur face à un adversaire, à partir de l'écart CPPH. */
export function expectedWinProbability(
  playerCpph: number,
  opponentCpph: number,
  sigma: number = SIGMA_CPPH
): number {
  return 1 / (1 + Math.pow(10, (opponentCpph - playerCpph) / sigma));
}

/**
 * Poids d'un match : le gain d'une victoire (1-p) est d'autant plus grand que l'adversaire
 * était favori ; le coût d'une défaite (p) est d'autant plus grand que l'adversaire était outsider.
 * Isolée ici pour pouvoir affiner la formule sans toucher à l'agrégation ni à l'affichage.
 */
export function getMatchWeight(
  playerCpph: number,
  opponentCpph: number,
  won: boolean,
  sigma: number = SIGMA_CPPH
): number {
  const p = expectedWinProbability(playerCpph, opponentCpph, sigma);
  return won ? 1 - p : p;
}

export function computeWeightedWinRate(matches: WeightedMatchInput[]): number {
  if (matches.length === 0) return 0;

  let wonWeight = 0;
  let totalWeight = 0;
  for (const match of matches) {
    const weight = getMatchWeight(match.playerCpph, match.opponentCpph, match.won);
    totalWeight += weight;
    if (match.won) wonWeight += weight;
  }

  return totalWeight > 0 ? wonWeight / totalWeight : 0;
}
