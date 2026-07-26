export interface WeightedMatchInput {
  /**
   * Force du camp du joueur au moment du match : son CPPH en simple, la moyenne
   * de la paire en double (un double se joue paire contre paire).
   */
  sideCpph: number;
  /** Force du camp adverse, calculée de la même façon. */
  opponentCpph: number;
  won: boolean;
}

/**
 * Échelle de l'écart CPPH, en points.
 *
 * Calibrée sur les 112 matchs individuels de la saison 2025/2026 par maximum de
 * vraisemblance : c'est la valeur qui reproduit le mieux les résultats observés.
 * L'échelle de 200 héritée de la maquette rendait le modèle bien trop sûr de lui
 * (elle prédisait 95% de victoire pour un écart de 200-300 points, là où le
 * favori ne l'emporte en réalité que 76% du temps).
 *
 * À réévaluer quand d'autres équipes du club auront été importées : l'échantillon
 * actuel ne couvre qu'une équipe, et sert à la fois à calibrer et à juger.
 */
export const SIGMA_CPPH = 460;

/** Nombre de matchs minimum pour considérer un indice comme fiable. */
export const SEUIL_FIABILITE = 8;

/** Probabilité de victoire attendue d'un camp face à l'autre, à partir de l'écart CPPH. */
export function expectedWinProbability(
  sideCpph: number,
  opponentCpph: number,
  sigma: number = SIGMA_CPPH
): number {
  return 1 / (1 + Math.pow(10, (opponentCpph - sideCpph) / sigma));
}

/**
 * Poids d'un match : le gain d'une victoire (1-p) est d'autant plus grand que l'adversaire
 * était favori ; le coût d'une défaite (p) est d'autant plus grand que l'adversaire était outsider.
 * Isolée ici pour pouvoir affiner la formule sans toucher à l'agrégation ni à l'affichage.
 */
export function getMatchWeight(
  sideCpph: number,
  opponentCpph: number,
  won: boolean,
  sigma: number = SIGMA_CPPH
): number {
  const p = expectedWinProbability(sideCpph, opponentCpph, sigma);
  return won ? 1 - p : p;
}

/**
 * Indice de performance rapporté au classement : somme des gains sur somme des
 * gains et des coûts. 0,5 signifie « exactement au niveau de son classement »,
 * au-dessus « meilleur que son classement ne le laissait attendre ».
 * Ce n'est donc pas un taux de victoire.
 */
export function computeWeightedWinRate(matches: WeightedMatchInput[]): number {
  if (matches.length === 0) return 0;

  let wonWeight = 0;
  let totalWeight = 0;
  for (const match of matches) {
    const weight = getMatchWeight(match.sideCpph, match.opponentCpph, match.won);
    totalWeight += weight;
    if (match.won) wonWeight += weight;
  }

  return totalWeight > 0 ? wonWeight / totalWeight : 0;
}
