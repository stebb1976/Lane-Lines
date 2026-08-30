"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Gender = "Women" | "Men";
type EventKey = "medley" | "free200" | "free400";
type StrokeKey = "back" | "breast" | "fly" | "free50" | "free100";
type Mode = "ranked" | "balanced";
type Swimmer = { id: string; name: string; gender: Gender; times: Record<StrokeKey, number>; unavailable: boolean; excludedEvents?: EventKey[]; lockEvent: EventKey | ""; lockTeam: number; lockStroke: StrokeKey | "" };
type Leg = { stroke: StrokeKey; swimmer: Swimmer; time: number };
type RelayTeam = { label: string; legs: Leg[]; total: number };
type RelayResult = { event: EventKey; teams: RelayTeam[] };

const EVENTS: { key: EventKey; name: string; short: string; legs: StrokeKey[] }[] = [
  { key: "medley", name: "200 Medley Relay", short: "200 Medley", legs: ["back", "breast", "fly", "free50"] },
  { key: "free200", name: "200 Freestyle Relay", short: "200 Free", legs: ["free50", "free50", "free50", "free50"] },
  { key: "free400", name: "400 Freestyle Relay", short: "400 Free", legs: ["free100", "free100", "free100", "free100"] },
];
const STROKES: { key: StrokeKey; label: string; short: string }[] = [
  { key: "back", label: "50 Back", short: "BK" }, { key: "breast", label: "50 Breast", short: "BR" },
  { key: "fly", label: "50 Fly", short: "FL" }, { key: "free50", label: "50 Free", short: "FR" },
  { key: "free100", label: "100 Free", short: "100" },
];
const sample = (gender: Gender, names: string[], offset: number): Swimmer[] => names.map((name, i) => ({
  id: `${gender}-${i}`, name, gender, unavailable: false, excludedEvents: [], lockEvent: "", lockTeam: 1, lockStroke: "",
  times: { back: 27.8 + i * .72 + offset, breast: 30.1 + i * .82 + offset, fly: 26.9 + i * .68 + offset, free50: 24.4 + i * .57 + offset, free100: 53.2 + i * 1.21 + offset },
}));
const INITIAL = [
  ...sample("Women", ["Maya Chen", "Olivia Brooks", "Sofia Ramirez", "Avery Walker", "Emma Patel", "Chloe Martin", "Zoe Thompson", "Lily Nguyen", "Grace Kim", "Nora Davis", "Isla Robinson", "Mia Johnson", "Ruby Wilson", "Ella Garcia", "Lucy Taylor", "Aria Brown"], 2.1),
  ...sample("Men", ["Liam Carter", "Noah Williams", "Ethan Lee", "Lucas Martinez", "Mason Clark", "James Anderson", "Henry Moore", "Leo Jackson", "Jack Harris", "Owen White", "Caleb Lewis", "Wyatt Young", "Miles Hall", "Theo Allen", "Eli King", "Finn Wright"], 0),
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const eventName = (key: EventKey) => EVENTS.find(e => e.key === key)?.short ?? key;
const strokeName = (key: StrokeKey) => STROKES.find(s => s.key === key)?.short ?? key;
const priorityWeight = (selected: EventKey[], eventKey: EventKey) => 10 ** (4 * (selected.length - selected.indexOf(eventKey) - 1));

const CSV_HEADERS = ["Gender", "Swimmer", "50 Back", "50 Breast", "50 Fly", "50 Free", "100 Free"];
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const parseCsvRows = (text: string) => {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
};
const parseTime = (value: string) => {
  const clean = value.trim();
  const parts = clean.split(":");
  const seconds = parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(clean);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 100) / 100 : NaN;
};

export function rosterToCsv(swimmers: Swimmer[]) {
  return [CSV_HEADERS.map(csvCell).join(","), ...swimmers.map(s => [s.gender, s.name, s.times.back.toFixed(2), s.times.breast.toFixed(2), s.times.fly.toFixed(2), s.times.free50.toFixed(2), s.times.free100.toFixed(2)].map(csvCell).join(","))].join("\r\n");
}

export function rosterFromCsv(text: string, fallbackGender: Gender): Swimmer[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("The CSV does not contain any swimmers.");
  const normalized = rows[0].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) => normalized.findIndex(value => names.includes(value));
  const columns = {
    gender: find("gender", "roster", "sex"), name: find("swimmer", "name", "swimmername"),
    back: find("50back", "back", "back50"), breast: find("50breast", "breast", "breast50"),
    fly: find("50fly", "fly", "fly50", "butterfly"), free50: find("50free", "free50", "freestyle50"),
    free100: find("100free", "free100", "freestyle100"),
  };
  if ([columns.name, columns.back, columns.breast, columns.fly, columns.free50, columns.free100].some(index => index < 0)) throw new Error("Use the exported column headings for swimmer and all five times.");
  const imported = rows.slice(1).map((values, index) => {
    const rawGender = columns.gender >= 0 ? values[columns.gender]?.toLowerCase() : "";
    const gender: Gender = rawGender.startsWith("b") || rawGender.startsWith("m") ? "Men" : rawGender.startsWith("g") || rawGender.startsWith("f") || rawGender.startsWith("w") ? "Women" : fallbackGender;
    const name = values[columns.name]?.trim();
    const times = { back: parseTime(values[columns.back] || ""), breast: parseTime(values[columns.breast] || ""), fly: parseTime(values[columns.fly] || ""), free50: parseTime(values[columns.free50] || ""), free100: parseTime(values[columns.free100] || "") };
    if (!name || Object.values(times).some(value => !Number.isFinite(value))) throw new Error(`Check swimmer row ${index + 2}. Every swimmer needs a name and five valid times.`);
    return { id: crypto.randomUUID(), name, gender, times, unavailable: false, excludedEvents: [], lockEvent: "" as const, lockTeam: 1, lockStroke: "" as const };
  });
  if (!imported.length) throw new Error("The CSV does not contain any swimmers.");
  return imported;
}

function TimeInput({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(2));
  useEffect(() => setDraft(value.toFixed(2)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    const rounded = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : value;
    setDraft(rounded.toFixed(2));
    onCommit(rounded);
  };
  return <input
    type="text"
    inputMode="decimal"
    value={draft}
    aria-label={label}
    onChange={e => { if (/^\d{0,3}(\.\d{0,2})?$/.test(e.target.value)) setDraft(e.target.value); }}
    onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
  />;
}

type FlowEdge = { to: number; rev: number; cap: number; cost: number; swimmerId?: string; slotId?: string };

export function exactRankedOptimize(active: Swimmer[], selected: EventKey[], teamCount: number, cap: number): { results: RelayResult[]; warning: string } {
  const assignments = new Map<string, Swimmer>();
  const appearances = new Map<string, number>();
  const eventUsed = new Map<EventKey, Set<string>>(selected.map(eventKey => [eventKey, new Set()]));
  let incomplete = false;

  // Ranked teams are optimized in priority order. Adding B–D can never change A.
  for (let team = 0; team < teamCount; team++) {
    const slots = selected.flatMap(eventKey => EVENTS.find(e => e.key === eventKey)!.legs.map((stroke, leg) => ({ id: `${eventKey}-${team}-${leg}`, eventKey, team, leg, stroke })));
    const source = 0;
    let nextNode = 1;
    const swimmerNodes = new Map<string, number>();
    active.forEach(s => swimmerNodes.set(s.id, nextNode++));
    const groupNodes = new Map<string, number>();
    active.forEach(s => selected.forEach(eventKey => groupNodes.set(`${s.id}-${eventKey}`, nextNode++)));
    const slotNodes = new Map<string, number>();
    slots.forEach(slot => slotNodes.set(slot.id, nextNode++));
    const sink = nextNode++;
    const graph: FlowEdge[][] = Array.from({ length: nextNode }, () => []);
    const addEdge = (from: number, to: number, capacity: number, cost: number, meta: Partial<FlowEdge> = {}) => {
      const fwd: FlowEdge = { to, rev: graph[to].length, cap: capacity, cost, ...meta };
      const rev: FlowEdge = { to: from, rev: graph[from].length, cap: 0, cost: -cost };
      graph[from].push(fwd); graph[to].push(rev);
    };
    active.forEach(s => {
      const remaining = cap - (appearances.get(s.id) || 0);
      if (remaining <= 0) return;
      addEdge(source, swimmerNodes.get(s.id)!, remaining, 0);
      selected.forEach(eventKey => {
        if (eventUsed.get(eventKey)!.has(s.id)) return;
        const group = groupNodes.get(`${s.id}-${eventKey}`)!;
        addEdge(swimmerNodes.get(s.id)!, group, 1, 0);
        slots.filter(slot => slot.eventKey === eventKey).forEach(slot => {
          const lockedElsewhere = s.lockEvent && (s.lockEvent !== eventKey || s.lockTeam !== team + 1 || (eventKey === "medley" && s.lockStroke && s.lockStroke !== slot.stroke));
          if (!(s.excludedEvents || []).includes(eventKey) && !lockedElsewhere) addEdge(group, slotNodes.get(slot.id)!, 1, Math.round(s.times[slot.stroke] * 100) * priorityWeight(selected, eventKey) - (s.lockEvent ? 1_000_000_000_000_000 : 0), { swimmerId: s.id, slotId: slot.id });
        });
      });
    });
    slots.forEach(slot => addEdge(slotNodes.get(slot.id)!, sink, 1, 0));
    let flow = 0;
    while (flow < slots.length) {
      const dist = Array(nextNode).fill(Infinity), inQueue = Array(nextNode).fill(false), prevNode = Array(nextNode).fill(-1), prevEdge = Array(nextNode).fill(-1);
      dist[source] = 0;
      const queue = [source]; inQueue[source] = true;
      while (queue.length) {
        const node = queue.shift()!; inQueue[node] = false;
        graph[node].forEach((edge, edgeIndex) => {
          if (edge.cap > 0 && dist[node] + edge.cost < dist[edge.to]) {
            dist[edge.to] = dist[node] + edge.cost; prevNode[edge.to] = node; prevEdge[edge.to] = edgeIndex;
            if (!inQueue[edge.to]) { queue.push(edge.to); inQueue[edge.to] = true; }
          }
        });
      }
      if (!Number.isFinite(dist[sink])) break;
      for (let node = sink; node !== source; node = prevNode[node]) {
        const edge = graph[prevNode[node]][prevEdge[node]]; edge.cap -= 1; graph[node][edge.rev].cap += 1;
      }
      flow += 1;
    }
    if (flow < slots.length) incomplete = true;
    graph.flat().forEach(edge => {
      if (edge.slotId && edge.swimmerId && edge.cap === 0) {
        const swimmer = active.find(s => s.id === edge.swimmerId)!;
        assignments.set(edge.slotId, swimmer);
        appearances.set(swimmer.id, (appearances.get(swimmer.id) || 0) + 1);
        eventUsed.get(edge.slotId.split("-")[0] as EventKey)!.add(swimmer.id);
      }
    });
  }
  const lockedMissing = active.some(s => s.lockEvent && selected.includes(s.lockEvent) && s.lockTeam <= teamCount && ![...assignments.values()].some(a => a.id === s.id));
  const results = selected.map(eventKey => {
    const event = EVENTS.find(e => e.key === eventKey)!;
    const teams = Array.from({ length: teamCount }, (_, team) => {
      const legs = event.legs.map((stroke, leg) => {
        const swimmer = assignments.get(`${eventKey}-${team}-${leg}`);
        return swimmer ? { stroke, swimmer, time: swimmer.times[stroke] } : null;
      }).filter((leg): leg is Leg => Boolean(leg));
      return { label: String.fromCharCode(65 + team), legs, total: legs.reduce((sum, leg) => sum + leg.time, 0) };
    });
    return { event: eventKey, teams };
  });
  const warning = incomplete ? `Not enough eligible swimmers to fill every team under the ${cap}-relay cap.` : lockedMissing ? "One or more relay locks conflict with the selected teams or participation cap." : "";
  return { results, warning };
}

export function exactBalancedOptimize(active: Swimmer[], selected: EventKey[], teamCount: number, cap: number): { results: RelayResult[]; warning: string } {
  const slots = selected.flatMap(eventKey => {
    const event = EVENTS.find(e => e.key === eventKey)!;
    return Array.from({ length: teamCount }, (_, team) => event.legs.map((stroke, leg) => ({ id: `${eventKey}-${team}-${leg}`, eventKey, team, leg, stroke }))).flat();
  });
  const source = 0;
  let nextNode = 1;
  const swimmerNodes = new Map<string, number>();
  active.forEach(s => swimmerNodes.set(s.id, nextNode++));
  const eventNodes = new Map<string, number>();
  active.forEach(s => selected.forEach(eventKey => eventNodes.set(`${s.id}-${eventKey}`, nextNode++)));
  const slotNodes = new Map<string, number>();
  slots.forEach(slot => slotNodes.set(slot.id, nextNode++));
  const sink = nextNode++;
  const graph: FlowEdge[][] = Array.from({ length: nextNode }, () => []);
  const addEdge = (from: number, to: number, capacity: number, cost: number, meta: Partial<FlowEdge> = {}) => {
    const fwd: FlowEdge = { to, rev: graph[to].length, cap: capacity, cost, ...meta };
    const rev: FlowEdge = { to: from, rev: graph[from].length, cap: 0, cost: -cost };
    graph[from].push(fwd); graph[to].push(rev);
  };
  active.forEach(s => {
    addEdge(source, swimmerNodes.get(s.id)!, cap, 0);
    selected.forEach(eventKey => {
      const eventNode = eventNodes.get(`${s.id}-${eventKey}`)!;
      addEdge(swimmerNodes.get(s.id)!, eventNode, 1, 0);
      slots.filter(slot => slot.eventKey === eventKey).forEach(slot => {
        const lockedElsewhere = s.lockEvent && (s.lockEvent !== eventKey || s.lockTeam !== slot.team + 1 || (eventKey === "medley" && s.lockStroke && s.lockStroke !== slot.stroke));
        if (!(s.excludedEvents || []).includes(eventKey) && !lockedElsewhere) addEdge(eventNode, slotNodes.get(slot.id)!, 1, Math.round(s.times[slot.stroke] * 100) * priorityWeight(selected, eventKey) - (s.lockEvent ? 1_000_000_000_000_000 : 0), { swimmerId: s.id, slotId: slot.id });
      });
    });
  });
  slots.forEach(slot => addEdge(slotNodes.get(slot.id)!, sink, 1, 0));
  let flow = 0;
  while (flow < slots.length) {
    const dist = Array(nextNode).fill(Infinity), inQueue = Array(nextNode).fill(false), prevNode = Array(nextNode).fill(-1), prevEdge = Array(nextNode).fill(-1);
    dist[source] = 0;
    const queue = [source]; inQueue[source] = true;
    while (queue.length) {
      const node = queue.shift()!; inQueue[node] = false;
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.cap > 0 && dist[node] + edge.cost < dist[edge.to]) {
          dist[edge.to] = dist[node] + edge.cost; prevNode[edge.to] = node; prevEdge[edge.to] = edgeIndex;
          if (!inQueue[edge.to]) { queue.push(edge.to); inQueue[edge.to] = true; }
        }
      });
    }
    if (!Number.isFinite(dist[sink])) break;
    for (let node = sink; node !== source; node = prevNode[node]) {
      const edge = graph[prevNode[node]][prevEdge[node]]; edge.cap -= 1; graph[node][edge.rev].cap += 1;
    }
    flow += 1;
  }
  const assignments = new Map<string, Swimmer>();
  graph.flat().forEach(edge => { if (edge.slotId && edge.swimmerId && edge.cap === 0) assignments.set(edge.slotId, active.find(s => s.id === edge.swimmerId)!); });
  const results = selected.map(eventKey => {
    const event = EVENTS.find(e => e.key === eventKey)!;
    const teams = Array.from({ length: teamCount }, (_, team) => {
      const legs = event.legs.map((stroke, leg) => {
        const swimmer = assignments.get(`${eventKey}-${team}-${leg}`);
        return swimmer ? { stroke, swimmer, time: swimmer.times[stroke] } : null;
      }).filter((leg): leg is Leg => Boolean(leg));
      return { label: String.fromCharCode(65 + team), legs, total: legs.reduce((sum, leg) => sum + leg.time, 0) };
    });
    // Balance only by exchanging the already-selected fastest swimmers on identical strokes.
    const score = () => { const avg = teams.reduce((sum, t) => sum + t.total, 0) / teams.length; return teams.reduce((sum, t) => sum + (t.total - avg) ** 2, 0); };
    for (let pass = 0; pass < 12; pass++) for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) {
      for (let ai = 0; ai < teams[a].legs.length; ai++) for (let bi = 0; bi < teams[b].legs.length; bi++) {
        const la = teams[a].legs[ai], lb = teams[b].legs[bi];
        if (la.stroke !== lb.stroke || la.swimmer.lockEvent || lb.swimmer.lockEvent) continue;
        const before = score(), oldA = teams[a].total, oldB = teams[b].total;
        teams[a].legs[ai] = { ...la, swimmer: lb.swimmer, time: lb.time };
        teams[b].legs[bi] = { ...lb, swimmer: la.swimmer, time: la.time };
        teams[a].total = oldA - la.time + lb.time; teams[b].total = oldB - lb.time + la.time;
        if (score() >= before - .000001) {
          teams[a].legs[ai] = la; teams[b].legs[bi] = lb; teams[a].total = oldA; teams[b].total = oldB;
        }
      }
    }
    return { event: eventKey, teams };
  });
  const lockedMissing = active.some(s => s.lockEvent && selected.includes(s.lockEvent) && s.lockTeam <= teamCount && ![...assignments.values()].some(a => a.id === s.id));
  const warning = flow < slots.length ? `Not enough eligible swimmers to fill every team under the ${cap}-relay cap.` : lockedMissing ? "One or more relay locks conflict with the selected teams or participation cap." : "";
  return { results, warning };
}

function optimize(roster: Swimmer[], selected: EventKey[], teamCount: number, mode: Mode, cap: number): { results: RelayResult[]; warning: string } {
  const active = roster.filter(s => !s.unavailable && s.name.trim());
  return mode === "ranked" ? exactRankedOptimize(active, selected, teamCount, cap) : exactBalancedOptimize(active, selected, teamCount, cap);
}

export default function Home() {
  const [swimmers, setSwimmers] = useState<Swimmer[]>(INITIAL);
  const [gender, setGender] = useState<Gender>("Women");
  const [events, setEvents] = useState<EventKey[]>(["medley", "free200", "free400"]);
  const [teamCount, setTeamCount] = useState(2);
  const [mode, setMode] = useState<Mode>("ranked");
  const [cap, setCap] = useState(2);
  const [results, setResults] = useState<RelayResult[]>([]);
  const [warning, setWarning] = useState("");
  const [saved, setSaved] = useState(true);
  const [rosterMessage, setRosterMessage] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const raw = localStorage.getItem("relay-room-roster"); if (raw) try { setSwimmers(JSON.parse(raw).map((s: Swimmer & { gender: Gender | "Girls" | "Boys" }) => ({ ...s, gender: s.gender === "Girls" ? "Women" : s.gender === "Boys" ? "Men" : s.gender }))); } catch {} }, []);
  useEffect(() => { if (!saved) { const timer = setTimeout(() => { localStorage.setItem("relay-room-roster", JSON.stringify(swimmers)); setSaved(true); }, 400); return () => clearTimeout(timer); } }, [swimmers, saved]);
  const roster = swimmers.filter(s => s.gender === gender);
  const update = (id: string, patch: Partial<Swimmer>) => { setSwimmers(all => all.map(s => s.id === id ? { ...s, ...patch } : s)); setSaved(false); };
  const moveEvent = (eventKey: EventKey, direction: -1 | 1) => setEvents(current => {
    const index = current.indexOf(eventKey), target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const run = () => { const out = optimize(roster, events, teamCount, mode, cap); setResults(out.results); setWarning(out.warning); document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }); };
  const add = () => { const n: Swimmer = { id: crypto.randomUUID(), name: "New swimmer", gender, unavailable: false, excludedEvents: [], lockEvent: "", lockTeam: 1, lockStroke: "", times: { back: 30, breast: 33, fly: 29, free50: 27, free100: 59 } }; setSwimmers(s => [...s, n]); setSaved(false); };
  const saveSetup = () => {
    const setup = { version: 1, savedAt: new Date().toISOString(), activeRoster: gender, selections: { events, teamCount, mode, maximumAppearances: cap }, swimmers };
    const blob = new Blob([JSON.stringify(setup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = gender === "Women" ? "womens_relay_optimizer.json" : "mens_relay_optimizer.json"; link.click(); URL.revokeObjectURL(url);
    setRosterMessage(`Saved both rosters and the current optimizer selections to ${link.download}.`);
  };
  const importRoster = async (file?: File) => {
    if (!file) return;
    try {
      const imported = rosterFromCsv(await file.text(), gender);
      const genders = new Set(imported.map(s => s.gender));
      setSwimmers(current => [...current.filter(s => !genders.has(s.gender)), ...imported]);
      setSaved(false); setResults([]); setRosterMessage(`Imported ${imported.length} swimmers. Existing ${[...genders].join(" and ").toLowerCase()} roster${genders.size > 1 ? "s" : ""} replaced.`);
    } catch (error) { setRosterMessage(error instanceof Error ? error.message : "That roster could not be imported."); }
    finally { if (importInput.current) importInput.current.value = ""; }
  };
  const spread = useMemo(() => results.flatMap(r => r.teams).length ? Math.max(...results.flatMap(r => r.teams).map(t => t.total)) - Math.min(...results.flatMap(r => r.teams).map(t => t.total)) : 0, [results]);

  return <main>
    <header className="topbar"><div className="brand"><span className="mark" aria-hidden="true">≋</span><span className="brand-copy"><span>Lane Lines</span><small>Relay Optimizer</small></span></div><div className="save"><span className={saved ? "dot" : "dot pending"}/>{saved ? "Saved on this device" : "Saving changes…"}</div></header>
    <section className="hero">
      <div><p className="eyebrow">LANE LINES · MEET TOOLS</p><h1>Build the right relay.<br/><em>Every time.</em></h1><p className="lede">Turn your roster into fast, fair, rule-ready relay teams in seconds.</p></div>
      <div className="hero-stats"><div><b>{roster.filter(s => !s.unavailable).length}</b><span>eligible swimmers</span></div><div><b>{events.length}</b><span>relay events</span></div><div><b>{teamCount}</b><span>teams per event</span></div></div>
    </section>
    <section className="workspace">
      <div className="controls card">
        <div className="section-title"><span>01</span><div><h2>Meet setup</h2><p>Choose how today’s relays should run.</p></div></div>
        <label>Roster</label><div className="segmented"><button className={gender === "Women" ? "active" : ""} onClick={() => { setGender("Women"); setResults([]); }}>Women</button><button className={gender === "Men" ? "active" : ""} onClick={() => { setGender("Men"); setResults([]); }}>Men</button></div>
        <label>Relay events · priority order</label><div className="event-checks">{[...events.map(key => EVENTS.find(e => e.key === key)!), ...EVENTS.filter(e => !events.includes(e.key))].map(e => { const priority = events.indexOf(e.key); return <div className={`event-row ${priority >= 0 ? "chosen" : ""}`} key={e.key}><button className="event-toggle" onClick={() => setEvents(v => v.includes(e.key) ? v.filter(x => x !== e.key) : [...v, e.key])}><span>{priority >= 0 ? priority + 1 : "+"}</span>{e.short}</button>{priority >= 0 && <div className="event-order"><button aria-label={`Move ${e.short} up`} disabled={priority === 0} onClick={() => moveEvent(e.key, -1)}>↑</button><button aria-label={`Move ${e.short} down`} disabled={priority === events.length - 1} onClick={() => moveEvent(e.key, 1)}>↓</button></div>}</div>})}</div>
        <label>Teams per event</label><div className="number-row">{[1,2,3,4].map(n => <button key={n} className={teamCount === n ? "active" : ""} onClick={() => setTeamCount(n)}>{n}<small>{String.fromCharCode(64+n)}</small></button>)}</div>
        <label>Optimization goal</label><div className="mode-cards"><button className={mode === "ranked" ? "active" : ""} onClick={() => setMode("ranked")}><b>Ranked</b><span>Fastest total time across every lineup</span></button><button className={mode === "balanced" ? "active" : ""} onClick={() => setMode("balanced")}><b>Balanced</b><span>Fastest swimmer pool, balanced across teams</span></button></div>
        <label>Maximum appearances</label><div className="cap"><span>Across the full meet</span><div>{[2,3].map(n => <button key={n} className={cap === n ? "active" : ""} onClick={() => setCap(n)}>{n}</button>)}</div></div>
        <button className="optimize" onClick={run} disabled={!events.length}>Optimize full meet <span>→</span></button>
      </div>
      <div className="roster card">
        <div className="section-title roster-head"><span>02</span><div><h2>{gender}’s roster</h2><p>Edit seed times, availability, exclusions, and relay locks.</p></div><div className="roster-actions"><input ref={importInput} type="file" accept=".csv,text/csv" aria-label="Import roster CSV" onChange={e => importRoster(e.target.files?.[0])}/><button onClick={() => importInput.current?.click()}>Import CSV</button><button onClick={saveSetup}>Save setup</button><button className="add-swimmer" onClick={add}>＋ Add swimmer</button></div></div>
        <div className="table-wrap"><table><thead><tr><th>Swimmer</th>{STROKES.map(s => <th key={s.key}>{s.label}</th>)}<th>Availability</th><th>Exclude from</th><th>Relay lock</th><th>Team</th><th>Stroke</th></tr></thead><tbody>{roster.map(s => <tr key={s.id} className={s.unavailable ? "muted" : ""}><td><input className="name" value={s.name} aria-label="Swimmer name" onChange={e => update(s.id, { name: e.target.value })}/></td>{STROKES.map(st => <td key={st.key}><TimeInput value={s.times[st.key]} label={`${s.name} ${st.label}`} onCommit={value => update(s.id, { times: { ...s.times, [st.key]: value } })}/></td>)}<td><button className={`availability ${s.unavailable ? "out" : ""}`} onClick={() => update(s.id, { unavailable: !s.unavailable })}>{s.unavailable ? "Out" : "Ready"}</button></td><td><div className="exclude-events">{EVENTS.map(event => { const excluded = (s.excludedEvents || []).includes(event.key); return <button key={event.key} className={excluded ? "excluded" : ""} aria-pressed={excluded} aria-label={`${excluded ? "Allow" : "Exclude"} ${s.name} ${event.name}`} title={event.short} onClick={() => update(s.id, { excludedEvents: excluded ? (s.excludedEvents || []).filter(key => key !== event.key) : [...(s.excludedEvents || []), event.key] })}>{event.key === "medley" ? "M" : event.key === "free200" ? "2F" : "4F"}</button>})}</div></td><td><select value={s.lockEvent} aria-label={`${s.name} relay lock`} onChange={e => update(s.id, { lockEvent: e.target.value as EventKey | "", lockStroke: "" })}><option value="">None</option>{EVENTS.map(e => <option key={e.key} value={e.key}>{e.short}</option>)}</select></td><td><select disabled={!s.lockEvent} value={s.lockTeam} onChange={e => update(s.id, { lockTeam: Number(e.target.value) })}>{[1,2,3,4].map(n => <option key={n} value={n}>{String.fromCharCode(64+n)}</option>)}</select></td><td><select disabled={s.lockEvent !== "medley"} value={s.lockStroke} onChange={e => update(s.id, { lockStroke: e.target.value as StrokeKey | "" })}><option value="">Any</option>{STROKES.slice(0,4).map(st => <option key={st.key} value={st.key}>{st.short}</option>)}</select></td></tr>)}</tbody></table></div>
        <p className="hint">Times are in seconds. Swipe or scroll the table sideways on smaller screens. Changes save automatically to this device. CSV imports replace each roster included in the file.</p>
        {rosterMessage && <p className="roster-message" role="status">{rosterMessage}</p>}
      </div>
    </section>
    <section id="results" className="results-section">
      <div className="results-head"><div><p className="eyebrow">THE LINEUP</p><h2>{results.length ? `${gender} · ${mode === "ranked" ? "Ranked" : "Balanced"} teams` : "Your optimized relays will appear here"}</h2></div>{results.length > 0 && <div className="result-meta"><span>{cap} max appearances</span>{mode === "balanced" && <span>{spread.toFixed(2)}s total range</span>}</div>}</div>
      {warning && <div className="warning">⚠ {warning} Try fewer teams, a higher appearance cap, or make more swimmers available.</div>}
      {!results.length ? <div className="empty"><div>↗</div><p>Select your meet setup, check the roster, then optimize.</p></div> : <div className="relay-list">{results.map(result => <article key={result.event} className="relay-block"><div className="relay-title"><h3>{eventName(result.event)}</h3><span>{result.teams.length} teams · fastest projected time highlighted</span></div><div className="team-grid">{result.teams.map((team, ti) => <div className={`team-card ${ti === 0 && mode === "ranked" ? "top" : ""}`} key={team.label}><div className="team-top"><div><span>TEAM</span><b>{team.label}</b></div><strong>{team.legs.length === 4 ? fmt(team.total) : "Incomplete"}</strong></div><ol>{team.legs.map((leg, i) => <li key={`${leg.swimmer.id}-${i}`}><span className="legnum">{i+1}</span><div><b>{leg.swimmer.name}</b><small>{strokeName(leg.stroke)}</small></div><time>{leg.time.toFixed(2)}</time></li>)}</ol></div>)}</div></article>)}</div>}
    </section>
    <footer><div className="brand"><span className="mark" aria-hidden="true">≋</span><span className="brand-copy"><span>Lane Lines</span><small>Relay Optimizer</small></span></div><p>Built for coaches. Data stays on your device.</p></footer>
  </main>;
}
