"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Bucket = "S" | "D" | "M";
type BucketStats = { n: number; w: number; l: number; raw: number | null; weighted: number | null };

interface ApiPlayer {
  playerId: string;
  name: string;
  club: string;
  teamId: string;
  sex: "F" | "H" | null;
  cpph: number;
  overall: BucketStats;
  perDiscipline: Record<Bucket, BucketStats>;
}

interface ApiFixture {
  date: string;
  opponent: string;
  venue: "Domicile" | "Extérieur";
  score: string;
  result: "V" | "N" | "D";
}

interface ApiTeam {
  id: string;
  name: string;
  division: string;
  w: number;
  d: number;
  l: number;
  matchWins: number;
  matchTotal: number;
  rosterSize: number;
  fixtures: ApiFixture[];
  topPlayers: { name: string; record: string; weighted: number | null }[];
}

interface SeasonResponse {
  teams: ApiTeam[];
  players: ApiPlayer[];
  lastRencontreDate: string | undefined;
  seuilFiabilite: number;
  sigmaCpph: number;
}

const RED = "#dc0338";
const RED_DEEP = "#a3042c";
const INK = "#14151a";
const INK_MUTED = "#6b7178";
const BORDER = "#e4e6e9";
const SURFACE = "#f7f8f9";
const PILL = "#eef0f2";

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : Math.round(v) + " %";
}

function sgn(v: number): string {
  return (v >= 0 ? "+" : "−") + Math.abs(Math.round(v));
}

function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function expectedWinProbability(deltaCpph: number, sigma: number): number {
  return 1 / (1 + Math.pow(10, deltaCpph / sigma));
}

function bucketStatsFor(player: ApiPlayer, disc: "all" | Bucket): BucketStats {
  return disc === "all" ? player.overall : player.perDiscipline[disc];
}

export default function Home() {
  const [data, setData] = useState<SeasonResponse | null>(null);
  const [tab, setTab] = useState<"club" | "players" | "teams">("club");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [disc, setDisc] = useState<"all" | Bucket>("all");
  const [sex, setSex] = useState<"all" | "F" | "H">("all");
  const [sort, setSort] = useState<"weighted" | "raw" | "delta" | "matches" | "cpph">("weighted");
  const [hideLow, setHideLow] = useState(true);
  const [selTeam, setSelTeam] = useState<string | null>(null);

  // L'en-tête est collant et sa hauteur varie avec la largeur de la fenêtre :
  // on la mesure pour décaler correctement les autres éléments collants.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(108);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeaderH(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  useEffect(() => {
    fetch("/api/season")
      .then((r) => r.json())
      .then((d: SeasonResponse) => {
        setData(d);
        if (d.teams.length > 0) setSelTeam(d.teams[0].id);
      });
  }, []);

  const teamOptions = useMemo(() => data?.teams.map((t) => ({ value: t.id, label: t.name })) ?? [], [data]);

  const playerRows = useMemo(() => {
    if (!data) return [];
    const seuil = data.seuilFiabilite;

    let rows = data.players
      .filter((p) => {
        if (team !== "all" && p.teamId !== team) return false;
        if (sex !== "all" && p.sex !== sex) return false;
        if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
        const stats = bucketStatsFor(p, disc);
        if (stats.n === 0) return false;
        if (hideLow && stats.n < seuil) return false;
        return true;
      })
      .map((p) => ({ player: p, stats: bucketStatsFor(p, disc) }));

    const cmp: Record<typeof sort, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
      weighted: (a, b) => (b.stats.weighted ?? -1) - (a.stats.weighted ?? -1),
      raw: (a, b) => (b.stats.raw ?? -1) - (a.stats.raw ?? -1),
      delta: (a, b) =>
        (b.stats.weighted ?? 0) - (b.stats.raw ?? 0) - ((a.stats.weighted ?? 0) - (a.stats.raw ?? 0)),
      matches: (a, b) => b.stats.n - a.stats.n,
      cpph: (a, b) => b.player.cpph - a.player.cpph,
    };
    rows.sort(cmp[sort]);
    return rows;
  }, [data, team, sex, q, disc, hideLow, sort]);

  const podium = useMemo(() => {
    if (!data) return [];
    const teamById = new Map(data.teams.map((t) => [t.id, t]));
    return [...data.players]
      .filter((p) => p.overall.n >= data.seuilFiabilite)
      .sort((a, b) => (b.overall.weighted ?? 0) - (a.overall.weighted ?? 0))
      .slice(0, 3)
      .map((p, i) => ({
        rankLabel: ["1er du club", "2e du club", "3e du club"][i],
        name: p.name,
        team: teamById.get(p.teamId)?.name ?? p.club,
        division: teamById.get(p.teamId)?.division ?? "",
        cpphLabel: String(p.cpph),
        wStr: pct(p.overall.weighted),
        rawStr: pct(p.overall.raw),
        deltaStr: sgn((p.overall.weighted ?? 0) - (p.overall.raw ?? 0)) + " pts",
        sStr: pct(p.perDiscipline.S.weighted),
        dStr: pct(p.perDiscipline.D.weighted),
        mStr: pct(p.perDiscipline.M.weighted),
        record: `${p.overall.w}–${p.overall.l}`,
      }));
  }, [data]);

  const scale = useMemo(() => {
    if (!data) return [];
    const labels = ["Nettement plus fort", "Un cran au-dessus", "Même niveau", "Un cran en dessous", "Nettement plus faible"];
    return [400, 200, 0, -200, -400].map((delta, i) => {
      const p = expectedWinProbability(delta, data.sigmaCpph);
      return {
        label: labels[i],
        delta: (delta > 0 ? "+" : delta < 0 ? "−" : "±") + Math.abs(delta) + " CPPH",
        p: Math.round(p * 100) + " %",
        gain: "+" + (1 - p).toFixed(2),
        cost: "−" + p.toFixed(2),
      };
    });
  }, [data]);

  const selTeamData = useMemo(() => data?.teams.find((t) => t.id === selTeam) ?? data?.teams[0], [data, selTeam]);

  if (!data) {
    return <div style={{ padding: 56, fontFamily: "var(--font-body)", color: INK_MUTED }}>Chargement…</div>;
  }

  const kRencontres = data.teams.reduce((s, t) => s + t.fixtures.length, 0);
  const kMatchs = data.players.reduce((s, p) => s + p.overall.n, 0);
  const kJoueurs = data.players.length;
  const totalWins = data.players.reduce((s, p) => s + p.overall.w, 0);
  const kWinRate = kMatchs > 0 ? Math.round((totalWins / kMatchs) * 100) + " %" : "—";

  const tabDef = (key: typeof tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      style={{
        appearance: "none",
        background: "none",
        border: "none",
        borderBottom: `3px solid ${tab === key ? RED : "transparent"}`,
        color: tab === key ? INK : INK_MUTED,
        fontFamily: "var(--font-display)",
        fontSize: 12,
        letterSpacing: ".07em",
        textTransform: "uppercase",
        padding: "16px 4px 13px",
        marginRight: 22,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div ref={headerRef} style={{ position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "14px 40px 0", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-primary.png" alt="Volant Club Toulousain" style={{ height: 44, width: "auto", display: "block", flex: "none" }} />
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(15px,1.6vw,19px)", letterSpacing: ".02em", textTransform: "uppercase", lineHeight: 1.15 }}>
              Bilan de saison — Interclubs 2025 / 2026
            </div>
          </div>
          <div className="app-header-meta" style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 1 auto", marginLeft: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: INK_MUTED }}>
                Dernière rencontre
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{data.lastRencontreDate ? frDate(data.lastRencontreDate) : "—"}</span>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: PILL, borderRadius: 999, padding: "7px 13px", fontSize: 11, fontWeight: 700, color: "#3a3c42" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: RED, display: "block" }} />
              Données figées
            </span>
          </div>
        </div>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 40px", display: "flex", gap: 4 }}>
          {tabDef("club", "Vue d'ensemble")}
          {tabDef("players", "Joueuses & joueurs")}
          {tabDef("teams", "Équipes")}
        </div>
      </div>

      {tab === "club" && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "56px 40px 96px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 64, alignItems: "end", paddingBottom: 44 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: RED, marginBottom: 18 }}>
                Saison 2025 / 2026
              </div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(38px,4.6vw,62px)", lineHeight: 0.96, letterSpacing: "-.01em", textTransform: "uppercase", margin: 0 }}>
                {data.teams.length} équipe{data.teams.length > 1 ? "s" : ""},<br />une saison,<br />un seul tableau.
              </h1>
            </div>
            <p style={{ margin: "0 0 6px", fontSize: 16, lineHeight: 1.6, color: "#3a3c42", maxWidth: 460 }}>
              Chaque rencontre est décomposée en matchs individuels, et chaque match est pondéré par l&apos;écart de classement CPPH avec l&apos;adversaire. Battre plus fort compte davantage ; perdre contre plus faible coûte davantage.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "24px 0", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: "34px 0", marginBottom: 80 }}>
            {[
              { v: String(data.teams.length), l: "Équipes engagées" },
              { v: String(kRencontres), l: "Rencontres jouées" },
              { v: String(kMatchs), l: "Matchs individuels" },
              { v: String(kJoueurs), l: "Licencié·es alignés" },
              { v: kWinRate, l: "Matchs gagnés (club)", accent: true },
            ].map((s, i) => (
              <div key={i} style={{ padding: i === 0 ? "0 24px 0 0" : i === 4 ? "0 0 0 24px" : "0 24px", borderRight: i < 4 ? `1px solid ${BORDER}` : undefined }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 44, lineHeight: 1, color: s.accent ? RED : INK }}>{s.v}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase", color: INK_MUTED, marginTop: 9 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {podium.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 26 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, textTransform: "uppercase", letterSpacing: "-.005em", margin: 0 }}>
                  Les plus belles saisons
                </h2>
                <div style={{ fontSize: 12.5, color: INK_MUTED }}>Classées à la performance rapportée au classement · minimum {data.seuilFiabilite} matchs</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24, marginBottom: 84 }}>
                {podium.map((p, i) => (
                  <div key={i} style={{ borderRadius: 20, overflow: "hidden", boxShadow: "0 1px 2px rgba(20,21,26,.04),0 8px 24px rgba(20,21,26,.08)", background: "#fff" }}>
                    <div style={{ position: "relative", background: "linear-gradient(135deg,#a3042c 0%,#5a1220 55%,#14151a 100%)", padding: "26px 26px 24px", overflow: "hidden" }}>
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 150, color: "rgba(255,255,255,.12)", letterSpacing: "-.03em", pointerEvents: "none" }}>
                        VCT
                      </div>
                      <div style={{ position: "relative" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ display: "inline-block", background: RED, color: "#fff", borderRadius: 999, padding: "5px 12px", fontFamily: "var(--font-display)", fontSize: 9.5, letterSpacing: ".09em", textTransform: "uppercase" }}>
                            {p.rankLabel}
                          </span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.62)" }}>{p.team}</span>
                        </div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1.08, textTransform: "uppercase", color: "#fff", marginTop: 52 }}>{p.name}</div>
                        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.72)", marginTop: 7 }}>CPPH {p.cpphLabel} · {p.division}</div>
                      </div>
                    </div>
                    <div style={{ padding: "24px 26px 26px" }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 52, lineHeight: 0.9, color: RED }}>{p.wStr}</div>
                        <div style={{ paddingBottom: 7 }}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: INK_MUTED }}>Perf. vs classement</div>
                          <div style={{ fontSize: 12.5, color: "#3a3c42", marginTop: 4 }}>{p.rawStr} de victoires ({p.deltaStr} pts)</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
                        {[
                          ["Simple", p.sStr],
                          ["Double", p.dStr],
                          ["Mixte", p.mStr],
                        ].map(([label, val]) => (
                          <div key={label} style={{ flex: 1 }}>
                            <div style={{ fontFamily: "var(--font-display)", fontSize: 9.5, letterSpacing: ".07em", textTransform: "uppercase", color: INK_MUTED }}>{label}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{val}</div>
                          </div>
                        ))}
                        <div style={{ flex: 1, textAlign: "right" }}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 9.5, letterSpacing: ".07em", textTransform: "uppercase", color: INK_MUTED }}>Bilan</div>
                          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{p.record}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 26 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, textTransform: "uppercase", margin: 0 }}>
              {data.teams.length > 1 ? `Les ${data.teams.length} équipes` : "L'équipe"}
            </h2>
            <div style={{ fontSize: 12.5, color: INK_MUTED }}>Cliquez une équipe pour ouvrir son détail</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 22, marginBottom: 84 }}>
            {data.teams.map((t) => {
              const winPct = t.matchTotal > 0 ? Math.round((t.matchWins / t.matchTotal) * 100) : 0;
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setTab("teams");
                    setSelTeam(t.id);
                  }}
                  style={{ cursor: "pointer", background: "#fff", borderRadius: 14, borderTop: `4px solid ${RED}`, boxShadow: "0 1px 2px rgba(20,21,26,.04),0 8px 24px rgba(20,21,26,.08)", padding: "22px 24px 24px" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 17, textTransform: "uppercase", lineHeight: 1 }}>{t.name.toUpperCase()}</div>
                      <div style={{ fontSize: 12.5, color: INK_MUTED, marginTop: 6 }}>{t.division}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 20 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 0.9 }}>{winPct} %</div>
                    <div style={{ fontSize: 11.5, color: INK_MUTED, paddingBottom: 4 }}>matchs individuels gagnés</div>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: PILL, marginTop: 12, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: RED, borderRadius: 999, width: `${winPct}%` }} />
                  </div>
                  <div style={{ display: "flex", gap: 18, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}`, fontSize: 12.5, color: "#3a3c42" }}>
                    <span><strong style={{ fontWeight: 800 }}>{t.w}</strong> V</span>
                    <span><strong style={{ fontWeight: 800 }}>{t.d}</strong> N</span>
                    <span><strong style={{ fontWeight: 800 }}>{t.l}</strong> D</span>
                    <span style={{ marginLeft: "auto", color: INK_MUTED }}>{t.rosterSize} joueur·ses</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 56, background: SURFACE, borderRadius: 20, padding: "48px 52px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: RED, marginBottom: 16 }}>Méthode</div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.06, textTransform: "uppercase", margin: "0 0 18px" }}>
                Tous les matchs ne valent pas la même chose
              </h2>
              <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.65, color: "#3a3c42" }}>
                Pour chaque match, on calcule la probabilité de victoire attendue à partir de l&apos;écart de points CPPH entre les deux camps, au moment de la rencontre. En double, on compare la moyenne de chaque paire :
              </p>
              <div style={{ background: "#fff", borderRadius: 8, padding: "18px 20px", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 13, color: INK, lineHeight: 1.7 }}>
                p = 1 / (1 + 10^((CPPH_adverse − CPPH_camp) / {data.sigmaCpph}))<br />
                <span style={{ color: INK_MUTED }}>gain d&apos;une victoire</span> = 1 − p<br />
                <span style={{ color: INK_MUTED }}>coût d&apos;une défaite</span> = p<br />
                <strong>perf. = Σgains / (Σgains + Σcoûts)</strong>
              </div>
              <p style={{ margin: "16px 0 0", fontSize: 13.5, lineHeight: 1.6, color: INK_MUTED }}>
                50 % signifie « exactement au niveau de son classement » : ce n&apos;est pas un taux de victoire. L&apos;échelle de {data.sigmaCpph} points CPPH est celle qui reproduit le mieux les résultats réellement observés cette saison — elle sera réajustée à mesure que d&apos;autres équipes seront importées.
              </p>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: INK_MUTED, marginBottom: 14 }}>
                Ce que vaut un match, en pratique
              </div>
              <table style={{ width: "100%", fontSize: 13.5 }}>
                <thead>
                  <tr>
                    {["Adversaire", "p attendue", "Victoire", "Défaite"].map((h) => (
                      <th key={h} style={{ textAlign: h === "Adversaire" ? "left" : "center", padding: "10px 8px", borderBottom: `1px solid ${BORDER}`, fontFamily: "var(--font-display)", fontSize: 9.5, letterSpacing: ".07em", textTransform: "uppercase", color: INK_MUTED }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scale.map((s, i) => (
                    <tr key={i}>
                      <td style={{ padding: "13px 8px", borderBottom: `1px solid ${BORDER}`, color: INK }}>
                        <strong style={{ fontWeight: 800 }}>{s.label}</strong><br /><span style={{ color: INK_MUTED, fontSize: 12 }}>{s.delta}</span>
                      </td>
                      <td style={{ padding: "13px 8px", borderBottom: `1px solid ${BORDER}`, textAlign: "center", color: INK_MUTED }}>{s.p}</td>
                      <td style={{ padding: "13px 8px", borderBottom: `1px solid ${BORDER}`, textAlign: "center", fontWeight: 800, color: RED }}>{s.gain}</td>
                      <td style={{ padding: "13px 8px", borderBottom: `1px solid ${BORDER}`, textAlign: "center", fontWeight: 800, color: "#3a3c42" }}>{s.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 22, background: "#fff", borderRadius: 8, padding: "16px 18px", fontSize: 13, lineHeight: 1.6, color: "#3a3c42" }}>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Fiabilité</strong>
                En dessous de {data.seuilFiabilite} matchs joués, l&apos;indice reste affiché mais l&apos;échantillon est signalé et exclu des classements.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "players" && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "44px 40px 96px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, textTransform: "uppercase", margin: 0 }}>Joueuses &amp; joueurs</h1>
            <div style={{ fontSize: 13, color: INK_MUTED }}>
              {playerRows.length} joueur·ses affichés sur {data.players.length} · {kMatchs} matchs individuels
            </div>
          </div>
          <p style={{ margin: "0 0 26px", fontSize: 14.5, color: "#3a3c42", maxWidth: 720 }}>
            <strong style={{ fontWeight: 700 }}>« Perf. vs classement » n&apos;est pas un taux de victoire</strong> : 50 % signifie « exactement au niveau de son classement », au-dessus « mieux que ce que son classement laissait attendre ». Un joueur peut donc gagner beaucoup tout en restant sous 50 % s&apos;il était favori partout. Le % de victoires brut reste affiché à côté pour comparaison.
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: SURFACE, borderRadius: 14, padding: "16px 18px", marginBottom: 26 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un nom…"
              style={{ flex: 1, minWidth: 220, border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 8, padding: "11px 14px", fontSize: 14, color: INK, outline: "none" }}
            />
            <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 8, padding: "11px 12px", fontSize: 13.5, color: INK }}>
              <option value="all">Toutes les équipes</option>
              {teamOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select value={disc} onChange={(e) => setDisc(e.target.value as typeof disc)} style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 8, padding: "11px 12px", fontSize: 13.5, color: INK }}>
              <option value="all">Toutes disciplines</option>
              <option value="S">Simple</option>
              <option value="D">Double</option>
              <option value="M">Mixte</option>
            </select>
            <select value={sex} onChange={(e) => setSex(e.target.value as typeof sex)} style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 8, padding: "11px 12px", fontSize: 13.5, color: INK }}>
              <option value="all">Femmes et hommes</option>
              <option value="F">Joueuses</option>
              <option value="H">Joueurs</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ border: `1px solid ${BORDER}`, background: "#fff", borderRadius: 8, padding: "11px 12px", fontSize: 13.5, color: INK }}>
              <option value="weighted">Tri : perf. vs classement</option>
              <option value="raw">Tri : % de victoires</option>
              <option value="delta">Tri : écart perf. − victoires</option>
              <option value="matches">Tri : nombre de matchs</option>
              <option value="cpph">Tri : classement CPPH</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#3a3c42", cursor: "pointer", paddingLeft: 4 }}>
              <input type="checkbox" checked={hideLow} onChange={(e) => setHideLow(e.target.checked)} style={{ accentColor: RED, width: 16, height: 16 }} />
              Masquer les échantillons faibles
            </label>
          </div>

          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1040, fontSize: 14 }}>
            <thead>
              <tr>
                {["#", "Joueur·se", "Équipe", "CPPH", "Bilan", "% victoires", "Perf. vs classement", "Écart", "S", "D", "M", "Fiabilité"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: ["CPPH", "Bilan", "% victoires", "Écart", "S", "D", "M"].includes(h) ? "right" : "left",
                      padding: "0 10px 12px 0",
                      fontFamily: "var(--font-display)",
                      fontSize: 9.5,
                      letterSpacing: ".07em",
                      textTransform: "uppercase",
                      color: INK_MUTED,
                      borderBottom: `1px solid ${INK}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {playerRows.map(({ player: p, stats }, i) => {
                const low = stats.n < data.seuilFiabilite;
                const wPct = Math.max(2, Math.min(100, Math.round(stats.weighted ?? 0)));
                const delta = (stats.weighted ?? 0) - (stats.raw ?? 0);
                return (
                  <tr key={p.playerId} style={{ borderBottom: `1px solid ${PILL}` }}>
                    <td style={{ padding: "13px 10px 13px 0", fontFamily: "var(--font-display)", fontSize: 14, color: low ? INK_MUTED : i < 3 ? RED : INK }}>
                      {low ? "—" : i + 1}
                    </td>
                    <td style={{ padding: "13px 10px", fontWeight: 700, color: INK }}>
                      {p.name}
                      <span style={{ color: INK_MUTED, fontWeight: 400, fontSize: 12.5 }}> · {p.sex ?? "?"}</span>
                    </td>
                    <td style={{ padding: "13px 10px", color: INK_MUTED, fontSize: 13 }}>{p.club}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", color: "#3a3c42" }}>{p.cpph}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", color: "#3a3c42" }}>{stats.w} – {stats.l}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", color: INK_MUTED }}>{pct(stats.raw)}</td>
                    <td style={{ padding: "13px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: INK, width: 52, textAlign: "right" }}>{pct(stats.weighted)}</span>
                        <span style={{ flex: 1, height: 7, borderRadius: 999, background: PILL, display: "block", position: "relative" }} title="50 % = exactement au niveau de son classement">
                          <span style={{ display: "block", height: "100%", borderRadius: 999, background: low ? "#e4e6e9" : (stats.weighted ?? 0) >= 50 ? RED : RED_DEEP, width: `${wPct}%` }} />
                          {/* repère du niveau attendu : 50 % */}
                          <span style={{ position: "absolute", left: "50%", top: -2, width: 1, height: 11, background: INK_MUTED, opacity: 0.55 }} />
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "13px 10px", textAlign: "right", fontWeight: 700, color: delta >= 0 ? RED : INK_MUTED }}>{sgn(delta)}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", color: "#3a3c42" }}>{pct(p.perDiscipline.S.weighted)}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", color: "#3a3c42" }}>{pct(p.perDiscipline.D.weighted)}</td>
                    <td style={{ padding: "13px 10px", textAlign: "right", color: "#3a3c42" }}>{pct(p.perDiscipline.M.weighted)}</td>
                    <td style={{ padding: "13px 0 13px 14px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          borderRadius: 999,
                          padding: "5px 10px",
                          fontFamily: "var(--font-display)",
                          fontSize: 9,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                          background: low ? "#fde8ec" : stats.n >= 15 ? PILL : SURFACE,
                          color: low ? RED_DEEP : "#3a3c42",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {low ? "Échantillon faible" : stats.n >= 15 ? `Solide · ${stats.n} m.` : `Correct · ${stats.n} m.`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {playerRows.length === 0 && (
            <div style={{ padding: "56px 0", textAlign: "center", color: INK_MUTED, fontSize: 14 }}>Aucun joueur ne correspond à ces filtres.</div>
          )}
        </div>
      )}

      {tab === "teams" && selTeamData && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "44px 40px 96px", display: "grid", gridTemplateColumns: "minmax(200px,250px) minmax(0,1fr)", gap: 44, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: headerH + 24, background: "#fff", zIndex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: INK_MUTED, marginBottom: 12 }}>
              {data.teams.length > 1 ? `Les ${data.teams.length} équipes` : "Équipe"}
            </div>
            {data.teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelTeam(t.id)}
                style={{
                  appearance: "none",
                  textAlign: "left",
                  border: "none",
                  borderLeft: `3px solid ${t.id === selTeamData.id ? RED : BORDER}`,
                  background: t.id === selTeamData.id ? SURFACE : "transparent",
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <span style={{ fontFamily: "var(--font-display)", fontSize: 12.5, textTransform: "uppercase", color: t.id === selTeamData.id ? INK : "#3a3c42" }}>{t.name.toUpperCase()}</span>
                <span style={{ fontSize: 11.5, color: INK_MUTED }}>{t.division}</span>
              </button>
            ))}
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, paddingBottom: 22, borderBottom: `1px solid ${INK}` }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: RED, marginBottom: 10 }}>{selTeamData.division}</div>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, textTransform: "uppercase", margin: 0, lineHeight: 1 }}>{selTeamData.name.toUpperCase()}</h1>
              </div>
              <div style={{ display: "flex", gap: 34, textAlign: "right" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1 }}>{selTeamData.w}·{selTeamData.d}·{selTeamData.l}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 9.5, letterSpacing: ".07em", textTransform: "uppercase", color: INK_MUTED, marginTop: 6 }}>V · N · D</div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: RED }}>
                    {selTeamData.matchTotal > 0 ? Math.round((selTeamData.matchWins / selTeamData.matchTotal) * 100) : 0} %
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 9.5, letterSpacing: ".07em", textTransform: "uppercase", color: INK_MUTED, marginTop: 6 }}>Matchs gagnés</div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 44, marginTop: 38 }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, textTransform: "uppercase", margin: "0 0 16px" }}>Les plus en forme</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {selTeamData.topPlayers.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: `1px solid ${PILL}` }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{p.name}</span>
                      <span style={{ fontSize: 12.5, color: INK_MUTED, width: 66, textAlign: "right" }}>{p.record}</span>
                      <span style={{ height: 7, width: 96, borderRadius: 999, background: PILL, overflow: "hidden", display: "block" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, background: RED, width: `${Math.max(2, Math.round(p.weighted ?? 0))}%` }} />
                      </span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 13.5, width: 52, textAlign: "right" }}>{pct(p.weighted)}</span>
                    </div>
                  ))}
                  {selTeamData.topPlayers.length === 0 && (
                    <div style={{ fontSize: 13, color: INK_MUTED, padding: "11px 0" }}>
                      Pas encore assez de matchs pour un classement fiable (min. {data.seuilFiabilite}).
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, textTransform: "uppercase", margin: "0 0 16px" }}>Rencontres de la saison</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selTeamData.fixtures.map((f, i) => {
                    const accent = f.result === "V" ? RED : f.result === "N" ? INK_MUTED : INK;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", borderRadius: 14, borderTop: `4px solid ${accent}`, boxShadow: "0 1px 2px rgba(20,21,26,.04),0 8px 24px rgba(20,21,26,.08)", padding: "14px 18px" }}>
                        <span style={{ fontSize: 12, color: INK_MUTED, width: 88, flex: "none" }}>{frDate(f.date)}</span>
                        <span style={{ display: "inline-block", background: PILL, borderRadius: 999, padding: "4px 9px", fontFamily: "var(--font-display)", fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#3a3c42", flex: "none" }}>
                          {f.venue}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 0 }}>{f.opponent}</span>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, flex: "none" }}>{f.score}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 999, background: accent, color: "#fff", fontFamily: "var(--font-display)", fontSize: 10, flex: "none" }}>
                          {f.result}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: INK, color: "#fff", padding: "44px 40px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-reversed-red-bg.png" alt="VCT" style={{ height: 52, width: "auto", borderRadius: 8, display: "block" }} />
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: ".05em", textTransform: "uppercase" }}>Volant Club Toulousain · Bilan interclubs</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", marginTop: 6 }}>
              Données issues des rencontres clippées depuis icbad.ffbad.org, converties automatiquement en JSON de saison.
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>
            Échelle CPPH {data.sigmaCpph} · seuil {data.seuilFiabilite} matchs
          </span>
        </div>
      </div>
    </div>
  );
}
