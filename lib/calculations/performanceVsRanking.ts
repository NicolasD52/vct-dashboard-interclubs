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
 * Échelle de l'écart CPPH, en points : l'écart qui donne 90 % de chances au
 * favori. Plus la valeur est grande, moins le classement départage.
 *
 * Calibrée par maximum de vraisemblance sur les 763 matchs de la saison
 * 2025/2026 — les 9 équipes du club, de la Pré Nationale à la D4. Intervalle
 * de confiance à 95 % : 478 – 724. Le modèle est bien calibré sur toute la
 * plage d'écarts : à 250–500 points le favori l'emporte 82,1 % du temps pour
 * 79,4 % prédits, à 500–800 points 89,7 % pour 91,4 % prédits.
 *
 * Une valeur par division ou par discipline a été testée et écartée : les huit
 * sous-groupes ont tous un intervalle qui contient 582, donc leurs écarts
 * apparents (355 en D1, 748 en R2) ne sont que du bruit d'échantillonnage. Le
 * classement départage aussi bien en D4 (69,4 % de favoris vainqueurs) qu'en
 * Pré Nationale (67,6 %).
 *
 * Rejouer `node scripts/calibrate-sigma.mjs` à chaque fin de saison.
 */
export const SIGMA_CPPH = 582;

/** Nombre de matchs minimum pour considérer une performance comme fiable. */
export const SEUIL_FIABILITE = 4;

/** Repère de la performance attendue : gagner exactement ce que le classement prédit. */
export const PERFORMANCE_NEUTRE = 100;

/**
 * Nombre de matchs fictifs, joués exactement au niveau attendu, ajoutés au
 * bilan de chaque joueur pour le classement du podium.
 *
 * Sur un petit échantillon, une ou deux bonnes surprises suffisent à produire
 * un pourcentage spectaculaire : 4 matchs à 139 % devançaient une saison
 * complète à 114 %. Ces matchs fictifs tirent les petits échantillons vers
 * 100 % et laissent les gros quasi inchangés — une performance ne se maintient
 * en tête que si elle tient sur la durée.
 *
 * Plus la valeur est élevée, plus il faut de matchs pour peser : à 15, un
 * joueur de 4 matchs ne peut plus atteindre le podium.
 */
export const MATCHS_DE_REFERENCE = 10;

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

/**
 * Même performance, mais ramenée vers 100 % d'autant plus fortement que le
 * joueur a disputé peu de matchs (voir MATCHS_DE_REFERENCE).
 *
 * Sert à classer le podium : une saison complète au-dessus de son niveau y pèse
 * plus qu'une poignée de matchs réussis. Le tableau détaillé, lui, continue
 * d'afficher la performance brute.
 */
export function computeAdjustedPerformance(
  matches: WeightedMatchInput[],
  matchsDeReference: number = MATCHS_DE_REFERENCE
): number {
  if (matches.length === 0) return PERFORMANCE_NEUTRE;
  const attendues = computeExpectedWins(matches);
  const victoires = matches.filter((m) => m.won).length;
  return ((victoires + matchsDeReference) / (attendues + matchsDeReference)) * 100;
}
