/**
 * Calibre SIGMA_CPPH sur les données réelles, par maximum de vraisemblance.
 *
 * Le modèle : p = 1 / (1 + 10^((CPPH_adverse − CPPH_camp) / sigma)).
 * Sigma est l'écart de CPPH qui donne 90 % de chances au favori. Plus il est
 * grand, moins le classement est censé prédire le résultat.
 *
 * Chaque match fournit UNE observation (le camp domicile), pas deux : les deux
 * camps sont parfaitement redondants (p_ext = 1 − p_dom) et les compter tous
 * les deux gonflerait artificiellement la taille de l'échantillon sans ajouter
 * la moindre information.
 *
 * Réserve : l'échantillon ne contient que des matchs impliquant le club. Sigma
 * décrit donc « le badminton tel que le VCT le rencontre », pas la population
 * générale des licenciés.
 *
 * Usage : node scripts/calibrate-sigma.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && e.name.endsWith(".json") ? [p] : [];
  });
}

const moyenne = (joueurs) => joueurs.reduce((s, j) => s + j.cpph, 0) / joueurs.length;

/** Une observation par match : écart de CPPH vu du camp domicile, et issue. */
function collecte() {
  const obs = [];
  for (const file of walk(DATA_DIR)) {
    const r = JSON.parse(fs.readFileSync(file, "utf-8"));
    for (const m of r.matches) {
      obs.push({
        division: r.homeTeam.division,
        discipline: m.discipline,
        ecart: moyenne(m.home) - moyenne(m.away),
        gagne: m.winnerSide === "home" ? 1 : 0,
      });
    }
  }
  return obs;
}

const proba = (ecart, sigma) => 1 / (1 + Math.pow(10, -ecart / sigma));

function logVraisemblance(obs, sigma) {
  let total = 0;
  for (const o of obs) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, proba(o.ecart, sigma)));
    total += o.gagne ? Math.log(p) : Math.log(1 - p);
  }
  return total;
}

/** Recherche ternaire : la log-vraisemblance est unimodale en sigma. */
function maximise(obs, bas = 20, haut = 20000) {
  for (let i = 0; i < 200; i++) {
    const a = bas + (haut - bas) / 3;
    const b = haut - (haut - bas) / 3;
    if (logVraisemblance(obs, a) < logVraisemblance(obs, b)) bas = a;
    else haut = b;
  }
  return (bas + haut) / 2;
}

/** Intervalle à 95 % par rapport de vraisemblance (chute de 1,92 du log). */
function intervalle(obs, sigma) {
  const seuil = logVraisemblance(obs, sigma) - 1.92;
  const cherche = (dir) => {
    let s = sigma;
    for (let i = 0; i < 400; i++) {
      const suivant = s * (dir > 0 ? 1.02 : 1 / 1.02);
      if (suivant < 10 || suivant > 1e6) return dir > 0 ? Infinity : 10;
      if (logVraisemblance(obs, suivant) < seuil) return suivant;
      s = suivant;
    }
    return dir > 0 ? Infinity : 10;
  };
  return [cherche(-1), cherche(1)];
}

/** Part des matchs remportés par le favori au classement (écart non nul). */
function tauxFavori(obs) {
  const avecEcart = obs.filter((o) => o.ecart !== 0);
  if (avecEcart.length === 0) return null;
  const n = avecEcart.filter((o) => (o.ecart > 0) === (o.gagne === 1)).length;
  return { taux: (n / avecEcart.length) * 100, n: avecEcart.length };
}

/** Log-loss moyen : plus bas = mieux. 0,693 = pile la pièce (aucun pouvoir prédictif). */
const logLoss = (obs, sigma) => -logVraisemblance(obs, sigma) / obs.length;

function tableauCalibration(obs, sigma) {
  const paliers = [0, 100, 250, 500, 800, 1200, Infinity];
  const lignes = [];
  for (let i = 0; i < paliers.length - 1; i++) {
    const dans = obs.filter((o) => {
      const e = Math.abs(o.ecart);
      return e >= paliers[i] && e < paliers[i + 1];
    });
    if (dans.length === 0) continue;
    // Vu du favori, pour que « observé » et « prédit » soient comparables.
    const reel = dans.filter((o) => (o.ecart > 0) === (o.gagne === 1)).length / dans.length;
    const predit = dans.reduce((s, o) => s + proba(Math.abs(o.ecart), sigma), 0) / dans.length;
    lignes.push({
      palier: paliers[i + 1] === Infinity ? `${paliers[i]}+` : `${paliers[i]}–${paliers[i + 1]}`,
      n: dans.length,
      reel: reel * 100,
      predit: predit * 100,
    });
  }
  return lignes;
}

function main() {
  const obs = collecte();
  if (obs.length === 0) {
    console.error("Aucune donnée dans data/ — lance d'abord parse-clippings.mjs.");
    process.exitCode = 1;
    return;
  }

  const sigma = maximise(obs);
  const [bas, haut] = intervalle(obs, sigma);
  const fav = tauxFavori(obs);

  console.log(`Échantillon : ${obs.length} matchs (1 observation par match).\n`);
  console.log(`SIGMA GLOBAL`);
  console.log(`  estimation      ${Math.round(sigma)}`);
  console.log(`  IC 95 %         ${Math.round(bas)} – ${haut === Infinity ? "∞" : Math.round(haut)}`);
  console.log(`  favori gagne    ${fav.taux.toFixed(1)} % (${fav.n} matchs à écart non nul)`);
  console.log(`  log-loss        ${logLoss(obs, sigma).toFixed(4)} (0,6931 = aucun pouvoir prédictif)`);

  console.log(`\nCALIBRATION (écart de CPPH, vue du favori)`);
  console.log(`  écart         n     observé   prédit`);
  for (const l of tableauCalibration(obs, sigma)) {
    console.log(
      `  ${l.palier.padEnd(11)} ${String(l.n).padStart(4)}   ${l.reel.toFixed(1).padStart(6)} %  ${l.predit.toFixed(1).padStart(6)} %`
    );
  }

  const parDivision = new Map();
  for (const o of obs) {
    if (!parDivision.has(o.division)) parDivision.set(o.division, []);
    parDivision.get(o.division).push(o);
  }
  console.log(`\nPAR DIVISION`);
  console.log(`  division        n     sigma   IC 95 %            favori   log-loss`);
  const ordre = ["Pré Nationale", "R2", "D1", "D2", "D4"];
  const cles = [...parDivision.keys()].sort(
    (a, b) => (ordre.indexOf(a) + 1 || 99) - (ordre.indexOf(b) + 1 || 99)
  );
  for (const div of cles) {
    const sous = parDivision.get(div);
    const s = maximise(sous);
    const [b, h] = intervalle(sous, s);
    const f = tauxFavori(sous);
    console.log(
      `  ${div.padEnd(14)} ${String(sous.length).padStart(4)}   ${String(Math.round(s)).padStart(5)}   ` +
        `${(Math.round(b) + " – " + (h === Infinity ? "∞" : Math.round(h))).padEnd(17)}  ` +
        `${f.taux.toFixed(1).padStart(5)} %   ${logLoss(sous, s).toFixed(4)}`
    );
  }

  console.log(`\nPAR DISCIPLINE`);
  console.log(`  discipline      n     sigma   IC 95 %            favori`);
  const parDiscipline = new Map();
  for (const o of obs) {
    const b = o.discipline === "DX" ? "Mixte" : o.discipline.startsWith("S") ? "Simple" : "Double";
    if (!parDiscipline.has(b)) parDiscipline.set(b, []);
    parDiscipline.get(b).push(o);
  }
  for (const d of ["Simple", "Double", "Mixte"]) {
    const sous = parDiscipline.get(d);
    if (!sous) continue;
    const s = maximise(sous);
    const [b, h] = intervalle(sous, s);
    const f = tauxFavori(sous);
    console.log(
      `  ${d.padEnd(14)} ${String(sous.length).padStart(4)}   ${String(Math.round(s)).padStart(5)}   ` +
        `${(Math.round(b) + " – " + (h === Infinity ? "∞" : Math.round(h))).padEnd(17)}  ${f.taux.toFixed(1).padStart(5)} %`
    );
  }

  console.log(
    `\nUn sigma par sous-groupe n'est justifié que si son intervalle exclut ${Math.round(sigma)}.`
  );
}

main();
