import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const VAULT_DIR = path.join(process.cwd(), "..", "VCT_obsi");
const DATA_DIR = path.join(process.cwd(), "data");

/** Une note n'est traitée que si elle vient bien d'une page de rencontre icbad. */
const SOURCE_RENCONTRE = /^source:\s*"?https:\/\/icbad\.ffbad\.org\/rencontre\/\d+/m;

/**
 * Le club est identifié par son code d'équipe (« 31-VCT-4 »), pas par son nom :
 * icbad écrit le nom tantôt seul, tantôt suffixé du numéro d'équipe selon la
 * compétition. Une comparaison sur le nom rate donc une rencontre sur trois et,
 * pire, attribue silencieusement la rencontre à l'adversaire.
 */
const OUR_CLUB_CODE = "31-VCT";

const MONTHS_FR = {
  janvier: "01", février: "02", fevrier: "02", mars: "03", avril: "04",
  mai: "05", juin: "06", juillet: "07", août: "08", aout: "08",
  septembre: "09", octobre: "10", novembre: "11", décembre: "12", decembre: "12",
};

const DISCIPLINE_MAP = {
  "Simple Homme": "SH",
  "Simple Dame": "SD",
  "Double Hommes": "DH",
  "Double Dames": "DD",
  "Double Mixte": "DX",
};

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Frontmatter introuvable");
  const [, yaml, body] = match;
  const get = (key) => {
    const m = yaml.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"));
    return m ? m[1] : "";
  };
  return {
    title: get("title"),
    source: get("source"),
    description: get("description"),
    body,
  };
}

function parseTitle(title) {
  const m = title.match(
    /rencontre (.+?) vs (.+?) du \w+ (\d{1,2}) (\p{L}+) (\d{4})/u
  );
  if (!m) throw new Error(`Titre non reconnu: ${title}`);
  const [, teamAName, teamBName, day, monthName, year] = m;
  const month = MONTHS_FR[monthName.toLowerCase()];
  if (!month) throw new Error(`Mois inconnu: ${monthName}`);
  const date = `${year}-${month}-${day.padStart(2, "0")}`;
  return { teamAName, teamBName, date, year: Number(year), month: Number(month) };
}

function parseDivision(description) {
  // `D\d` couvre les divisions départementales (Comité 31 D1/D2/D4), absentes
  // tant qu'on n'avait que les équipes régionales.
  const m = description.match(/\b(Pré[- ]?Nationale|Nationale\s*\d?|Régionale\s*\d?|[RD]\d)\b/i);
  return m ? m[1] : description;
}

/** « Volant Club Toulousain - 4 » -> « Volant Club Toulousain ». */
function clubName(titleName) {
  return titleName.replace(/\s*-\s*\d+$/, "").trim();
}

/** « 31-VCT-4 » -> « 31-VCT » ; le numéro d'équipe est lu à part. */
function clubCode(teamCode) {
  return teamCode.replace(/-\d+$/, "");
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function parseRencontre(fileContent) {
  const { title, source, description, body } = parseFrontmatter(fileContent);
  const { teamAName, teamBName, date, year, month } = parseTitle(title);
  const idMatch = source.match(/\/rencontre\/(\d+)/);
  if (!idMatch) throw new Error(`Source URL sans id: ${source}`);
  const id = idMatch[1];

  const $ = cheerio.load(body);
  const tables = $("table.rencontre");
  const headerTable = tables.eq(0);
  const teamLinks = headerTable.find("a.uk-link-reset");
  const homeTeamId = teamLinks.eq(0).attr("href").match(/\/equipe\/(\d+)/)[1];
  const awayTeamId = teamLinks.eq(1).attr("href").match(/\/equipe\/(\d+)/)[1];
  // Le code d'équipe (ex. « 31-VCT-2 ») est le seul endroit du clip qui porte le
  // numéro d'équipe : le titre, lui, ne donne que le nom du club.
  const homeCode = cleanText(teamLinks.eq(0).text());
  const awayCode = cleanText(teamLinks.eq(1).text());
  const teamNumber = (code) => {
    const m = code.match(/-(\d+)$/);
    return m ? Number(m[1]) : undefined;
  };
  const scoreText = headerTable.find("th.uk-text-nowrap").text().trim();
  const [scoreHome, scoreAway] = scoreText.split("-").map((s) => Number(s.trim()));

  const homeIsOurs = clubCode(homeCode) === OUR_CLUB_CODE;
  const awayIsOurs = clubCode(awayCode) === OUR_CLUB_CODE;
  if (!homeIsOurs && !awayIsOurs) {
    throw new Error(
      `Aucune équipe du club dans cette rencontre (${homeCode} vs ${awayCode}) — clip à retirer du coffre ?`
    );
  }
  if (homeIsOurs && awayIsOurs) {
    // Deux équipes du club l'une contre l'autre : le modèle n'a qu'un seul
    // « notre camp », donc on refuse plutôt que de n'en compter qu'une moitié.
    throw new Error(
      `Rencontre entre deux équipes du club (${homeCode} vs ${awayCode}) — non gérée par le modèle actuel`
    );
  }
  const ourTeamSide = homeIsOurs ? "home" : "away";
  const division = parseDivision(description);

  // L'identité d'une équipe est son code, pas l'id icbad : icbad crée une
  // nouvelle entrée /equipe/{id} à chaque phase (poule, barrages, petite
  // finale), ce qui dédoublait les équipes du club au fil de la saison.
  const teamRef = (code, icbadId, titleName) => ({
    id: code || icbadId,
    icbadId,
    name: clubName(titleName),
    division,
    code,
    number: teamNumber(code),
  });
  const homeTeam = teamRef(homeCode, homeTeamId, teamAName);
  const awayTeam = teamRef(awayCode, awayTeamId, teamBName);

  const matches = [];
  const skipped = [];
  for (let i = 1; i < tables.length; i++) {
    const table = tables.eq(i);
    const headerText = cleanText(table.find("th[colspan]").first().text());
    const disciplineMatch = Object.keys(DISCIPLINE_MAP).find((key) =>
      headerText.startsWith(key)
    );
    if (!disciplineMatch) throw new Error(`Discipline non reconnue: ${headerText}`);
    const discipline = DISCIPLINE_MAP[disciplineMatch];
    const number = headerText.replace(disciplineMatch, "").trim();
    const code = `${discipline}${number}`;

    const rows = table
      .children("tbody")
      .children("tr")
      .filter((_, el) => $(el).find("th").length === 0);
    if (rows.length !== 2) throw new Error(`Attendu 2 lignes pour ${code}, trouvé ${rows.length}`);

    const sides = rows.toArray().map((row) => {
      const $row = $(row);
      const isWinner = $row.hasClass("mobile-winner-gradient");
      const players = $row
        .children("td")
        .eq(0)
        .find("table")
        .first()
        .children("tbody")
        .children("tr")
        .toArray()
        .map((playerRow) => {
          const $p = $(playerRow);
          const clsmt = $p.find(".ic-match-clsmt");
          const link = $p.find(".joueur-nom a");
          const playerIdMatch = (link.attr("href") || "").match(/\/joueur\/(\d+)/);
          return {
            playerId: playerIdMatch ? playerIdMatch[1] : null,
            name: cleanText(link.text()),
            rankLabel: cleanText(clsmt.text()),
            cpph: Number(clsmt.attr("data-cote")),
          };
        });
      const setScores = $row
        .find("table.table-score td")
        .toArray()
        .map((td) => Number($(td).text().trim()));
      return { players, setScores, isWinner };
    });

    const [homeSide, awaySide] = sides;
    const sets = homeSide.setScores.map((homeScore, idx) => ({
      home: homeScore,
      away: awaySide.setScores[idx],
    }));
    const winnerSide = homeSide.isWinner ? "home" : awaySide.isWinner ? "away" : null;
    if (!winnerSide) {
      // En barrage / play-off, la rencontre s'arrête dès qu'elle est jouée :
      // les matchs restants apparaissent sans score ni vainqueur. On les ignore
      // au lieu de perdre toute la rencontre.
      if (sets.length === 0) {
        skipped.push(`${code} (non joué)`);
        continue;
      }
      throw new Error(`Aucun gagnant identifié pour ${code} alors que le score est renseigné`);
    }

    // Forfait : un camp n'aligne personne. La victoire compte dans le score de
    // la rencontre mais pas dans les statistiques individuelles — sans
    // adversaire il n'y a ni CPPH de référence, ni performance à mesurer.
    if (homeSide.players.length === 0 || awaySide.players.length === 0) {
      skipped.push(`${code} (forfait)`);
      continue;
    }

    matches.push({
      code,
      discipline,
      home: homeSide.players.map((p) => ({ ...p, club: homeTeam.name })),
      away: awaySide.players.map((p) => ({ ...p, club: awayTeam.name })),
      sets,
      winnerSide,
    });
  }

  const season = month >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`;

  return {
    rencontre: {
      id,
      season,
      competition: description,
      date,
      ourTeamSide,
      homeTeam,
      awayTeam,
      scoreHome,
      scoreAway,
      matches,
    },
    skipped,
  };
}

/**
 * Parcourt tout le coffre à la recherche des notes de rencontre, quelle que
 * soit l'arborescence choisie dans Obsidian. On filtre sur la source icbad
 * plutôt que sur un dossier : réorganiser le coffre ne casse plus l'import,
 * et les notes qui ne sont pas des rencontres sont ignorées sans bruit.
 */
/** Fichiers déjà produits par ce script (et eux seuls). */
function walkGenerated(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkGenerated(fullPath);
    return /^rencontre-\d+\.json$/.test(entry.name) ? [fullPath] : [];
  });
}

function findClippings(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findClippings(fullPath);
    if (!entry.isFile() || !entry.name.endsWith(".md")) return [];
    const content = fs.readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n");
    return SOURCE_RENCONTRE.test(content) ? [{ fullPath, content }] : [];
  });
}

function main() {
  if (!fs.existsSync(VAULT_DIR)) {
    console.error(`Coffre Obsidian introuvable : ${VAULT_DIR}`);
    process.exitCode = 1;
    return;
  }

  const files = findClippings(VAULT_DIR);
  if (files.length === 0) {
    console.error(`Aucune note de rencontre trouvée dans ${VAULT_DIR}.`);
    console.error(`Vérifie que les clips contiennent bien « source: https://icbad.ffbad.org/rencontre/... ».`);
    process.exitCode = 1;
    return;
  }

  // Les fichiers sont intégralement régénérés depuis le coffre : on efface les
  // sorties précédentes pour qu'un clip supprimé ou renommé ne laisse pas
  // derrière lui une rencontre fantôme qui continuerait d'alimenter les stats.
  for (const stale of walkGenerated(DATA_DIR)) fs.rmSync(stale);

  let ok = 0;
  const equipes = new Map();
  const vus = new Map();
  const ignores = [];

  for (const { fullPath, content } of files) {
    const file = path.relative(VAULT_DIR, fullPath);
    try {
      const { rencontre, skipped } = parseRencontre(content);
      const doublon = vus.get(rencontre.id);
      if (doublon) throw new Error(`Rencontre ${rencontre.id} déjà clippée dans « ${doublon} »`);
      vus.set(rencontre.id, path.basename(file));
      if (skipped.length > 0) ignores.push(`rencontre ${rencontre.id} : ${skipped.join(", ")}`);
      // Le dossier suit la saison déduite de la date, pour que l'ajout d'une
      // nouvelle saison ne vienne pas se mélanger à la précédente.
      const dossier = path.join(DATA_DIR, `saison-${rencontre.season.replace("/", "-")}`);
      fs.mkdirSync(dossier, { recursive: true });
      const outPath = path.join(dossier, `rencontre-${rencontre.id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(rencontre, null, 2) + "\n", "utf-8");

      const nous = rencontre.ourTeamSide === "home" ? rencontre.homeTeam : rencontre.awayTeam;
      const cle = nous.code ?? nous.id;
      equipes.set(cle, (equipes.get(cle) ?? 0) + 1);

      console.log(`OK   ${path.basename(file)} -> ${path.basename(dossier)}/rencontre-${rencontre.id}.json`);
      ok++;
    } catch (err) {
      console.error(`FAIL ${file}: ${err.message}`);
    }
  }

  console.log(`\n${ok}/${files.length} rencontres converties.`);
  if (ignores.length > 0) {
    console.log(`\nMatchs exclus des statistiques :`);
    for (const ligne of ignores) console.log(`  ${ligne}`);
  }
  console.log(`\nÉquipes du club détectées :`);
  for (const [code, n] of [...equipes].sort()) {
    console.log(`  ${code} — ${n} rencontre${n > 1 ? "s" : ""}`);
  }
}

main();
