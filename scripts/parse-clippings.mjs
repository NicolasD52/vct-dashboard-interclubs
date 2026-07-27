import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const VAULT_DIR = path.join(process.cwd(), "..", "VCT_obsi");
const DATA_DIR = path.join(process.cwd(), "data");

/** Une note n'est traitée que si elle vient bien d'une page de rencontre icbad. */
const SOURCE_RENCONTRE = /^source:\s*"?https:\/\/icbad\.ffbad\.org\/rencontre\/\d+/m;

const OUR_CLUB_NAME = "Volant Club Toulousain";

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
  const m = description.match(/(Pré[- ]?Nationale|Nationale\s*\d?|Régionale\s*\d?|R\d)/i);
  return m ? m[1] : description;
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

  const ourTeamSide = teamAName === OUR_CLUB_NAME ? "home" : "away";
  const division = parseDivision(description);

  const homeTeam = { id: homeTeamId, name: teamAName, division, code: homeCode, number: teamNumber(homeCode) };
  const awayTeam = { id: awayTeamId, name: teamBName, division, code: awayCode, number: teamNumber(awayCode) };

  const matches = [];
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
    if (!winnerSide) throw new Error(`Aucun gagnant identifié pour ${code} (rencontre ${id})`);

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
  };
}

/**
 * Parcourt tout le coffre à la recherche des notes de rencontre, quelle que
 * soit l'arborescence choisie dans Obsidian. On filtre sur la source icbad
 * plutôt que sur un dossier : réorganiser le coffre ne casse plus l'import,
 * et les notes qui ne sont pas des rencontres sont ignorées sans bruit.
 */
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

  let ok = 0;
  const equipes = new Map();

  for (const { fullPath, content } of files) {
    const file = path.relative(VAULT_DIR, fullPath);
    try {
      const rencontre = parseRencontre(content);
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
  console.log(`Équipes du club détectées :`);
  for (const [code, n] of [...equipes].sort()) {
    console.log(`  ${code} — ${n} rencontre${n > 1 ? "s" : ""}`);
  }
}

main();
