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

/** Nombre de matchs minimum pour considérer une performance comme fiable. */
export const SEUIL_FIABILITE = 8;

/** Repère de la performance attendue : gagner exactement ce que le classement prédit. */
export const PERFORMANCE_NEUTRE = 100;

/** Probabilité de victoire attendue d'un camp face à l'autre, à partir de l'écart CPPH. */
export function expectedWinProbability(
  sideCpph: number,
  opponentCpph: number,
  sigma: number = SIGMA_CPPH
): number {
  return 1 / (1 + Math.pow(10, (opponentCpph - sideCpph) / sigma));
}

/**
 * Nombre de victoires que le classement laissait attendre sur ces matchs :
 * la somme des probabilités de victoire, match par match. La difficulté des
 * adversaires est donc déjà intégrée ici.
 */
export function computeExpectedWins(matches: WeightedMatchInput[]): number {
  return matches.reduce(
    (sum, m) => sum + expectedWinProbability(m.sideCpph, m.opponentCpph),
    0
  );
}

/**
 * Performance rapportée au classement, en pourcentage : victoires réelles
 * rapportées aux victoires attendues.
 *
 * 100 = le joueur a gagné exactement ce que son classement prédisait.
 * Au-dessus = il a fait mieux que son classement ; en dessous = moins bien.
 * Ce n'est donc pas un taux de victoire : on peut gagner beaucoup de matchs et
 * rester sous 100 si on était favori partout.
 *
 * Isolée ici pour pouvoir affiner la méthode sans toucher à l'agrégation ni à
 * l'affichage.
 */
export function computePerformanceVsRanking(matches: WeightedMatchInput[]): number {
  if (matches.length === 0) return PERFORMANCE_NEUTRE;
  const attendues = computeExpectedWins(matches);
  if (attendues <= 0) return PERFORMANCE_NEUTRE;
  const victoires = matches.filter((m) => m.won).length;
  return (victoires / attendues) * 100;
}
