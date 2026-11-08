"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { laneLinesRelease } from "../app-version";

type Gender = "Women" | "Men";
type EventKey = "medley" | "free200" | "free400";
type StrokeKey = "back" | "breast" | "fly" | "free50" | "free100";
type Mode = "ranked" | "balanced";
type RelayLock = { event: EventKey; team: number; leg: number };
type Swimmer = { id: string; name: string; gender: Gender; times: Record<StrokeKey, number>; unavailable: boolean; excludedEvents?: EventKey[]; relayLocks?: RelayLock[]; lockEvent?: EventKey | ""; lockTeam?: number; lockStroke?: StrokeKey | ""; lockLeg?: number | null };
type Leg = { stroke: StrokeKey; swimmer: Swimmer; time: number; position: number };
type RelayTeam = { label: string; legs: Leg[]; total: number };
type RelayResult = { event: EventKey; teams: RelayTeam[] };
type SavedRelayResult = { event: EventKey; teams: { label: string; legs: { stroke: StrokeKey; swimmerId: string; position: number }[] }[] };
type SetupFile = { version: number; savedAt: string; optimizationName?: string; activeRoster: Gender; selections: { events: EventKey[]; teamCount: number; mode: Mode; maximumAppearances: number }; swimmers: Swimmer[]; generatedLineup?: SavedRelayResult[] };
type SetupFileHandle = { name: string; getFile: () => Promise<File>; createWritable: () => Promise<{ write: (contents: string) => Promise<void>; close: () => Promise<void> }> };
type PickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<SetupFileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<SetupFileHandle>;
};

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
  id: `${gender}-${i}`, name, gender, unavailable: false, excludedEvents: [], relayLocks: [],
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
const relayLocks = (swimmer: Swimmer): RelayLock[] => {
  if (swimmer.relayLocks) return swimmer.relayLocks;
  if (!swimmer.lockEvent) return [];
  const event = EVENTS.find(item => item.key === swimmer.lockEvent);
  const leg = swimmer.lockLeg ?? (swimmer.lockStroke ? event?.legs.findIndex(stroke => stroke === swimmer.lockStroke) : -1);
  return [{ event: swimmer.lockEvent, team: (swimmer.lockTeam || 1) - 1, leg: leg != null && leg >= 0 ? leg : 0 }];
};

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
    return { id: crypto.randomUUID(), name, gender, times, unavailable: false, excludedEvents: [], relayLocks: [] };
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

function RosterLocks({ swimmer, teamCount, onAdd, onRemove }: { swimmer: Swimmer; teamCount: number; onAdd: (event: EventKey, team: number, leg: number) => void; onRemove: (lock: RelayLock) => void }) {
  const [event, setEvent] = useState<EventKey>("medley");
  const [team, setTeam] = useState(0);
  const [leg, setLeg] = useState(0);
  const eventInfo = EVENTS.find(item => item.key === event)!;
  const selectedTeam = Math.min(team, Math.max(0, teamCount - 1));
  return <div className="roster-locks">
    <div className="roster-lock-list">{relayLocks(swimmer).map(lock => {
      const lockedEvent = EVENTS.find(item => item.key === lock.event)!;
      const position = lock.event === "medley" ? strokeName(lockedEvent.legs[lock.leg]) : `Leg ${lock.leg + 1}`;
      return <span key={`${lock.event}-${lock.team}-${lock.leg}`}>{eventName(lock.event)} · {String.fromCharCode(65 + lock.team)} · {position}<button aria-label={`Remove ${swimmer.name} ${eventName(lock.event)} team ${String.fromCharCode(65 + lock.team)} ${position} lock`} onClick={() => onRemove(lock)}>×</button></span>;
    })}</div>
    <div className="roster-lock-add">
      <select value={event} aria-label={`${swimmer.name} lock relay`} onChange={e => { setEvent(e.target.value as EventKey); setLeg(0); }}>{EVENTS.map(item => <option key={item.key} value={item.key}>{item.short}</option>)}</select>
      <select value={selectedTeam} aria-label={`${swimmer.name} lock team`} onChange={e => setTeam(Number(e.target.value))}>{Array.from({ length: teamCount }, (_, index) => <option key={index} value={index}>Team {String.fromCharCode(65 + index)}</option>)}</select>
      <select value={leg} aria-label={`${swimmer.name} lock position`} onChange={e => setLeg(Number(e.target.value))}>{eventInfo.legs.map((stroke, index) => <option key={index} value={index}>{event === "medley" ? strokeName(stroke) : `Leg ${index + 1}`}</option>)}</select>
      <button onClick={() => onAdd(event, selectedTeam, leg)}>Lock</button>
    </div>
  </div>;
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
      const reservedForLater = relayLocks(s).filter(lock => selected.includes(lock.event) && lock.team > team && lock.team < teamCount).length;
      const availableNow = remaining - reservedForLater;
      if (availableNow <= 0) return;
      addEdge(source, swimmerNodes.get(s.id)!, availableNow, 0);
      selected.forEach(eventKey => {
        if (eventUsed.get(eventKey)!.has(s.id)) return;
        const group = groupNodes.get(`${s.id}-${eventKey}`)!;
        addEdge(swimmerNodes.get(s.id)!, group, 1, 0);
        slots.filter(slot => slot.eventKey === eventKey).forEach(slot => {
          const eventLock = relayLocks(s).find(lock => lock.event === eventKey);
          const lockedElsewhere = eventLock && (eventLock.team !== team || eventLock.leg !== slot.leg);
          const lockedHere = eventLock && eventLock.team === team && eventLock.leg === slot.leg;
          if (!(s.excludedEvents || []).includes(eventKey) && !lockedElsewhere) addEdge(group, slotNodes.get(slot.id)!, 1, Math.round(s.times[slot.stroke] * 100) * priorityWeight(selected, eventKey) - (lockedHere ? 1_000_000_000_000_000 : 0), { swimmerId: s.id, slotId: slot.id });
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
  const lockedMissing = active.some(s => relayLocks(s).some(lock => selected.includes(lock.event) && lock.team < teamCount && assignments.get(`${lock.event}-${lock.team}-${lock.leg}`)?.id !== s.id));
  const results = selected.map(eventKey => {
    const event = EVENTS.find(e => e.key === eventKey)!;
    const teams = Array.from({ length: teamCount }, (_, team) => {
      const legs = event.legs.map((stroke, leg) => {
        const swimmer = assignments.get(`${eventKey}-${team}-${leg}`);
        return swimmer ? { stroke, swimmer, time: swimmer.times[stroke], position: leg } : null;
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
        const eventLock = relayLocks(s).find(lock => lock.event === eventKey);
        const lockedElsewhere = eventLock && (eventLock.team !== slot.team || eventLock.leg !== slot.leg);
        const lockedHere = eventLock && eventLock.team === slot.team && eventLock.leg === slot.leg;
        if (!(s.excludedEvents || []).includes(eventKey) && !lockedElsewhere) addEdge(eventNode, slotNodes.get(slot.id)!, 1, Math.round(s.times[slot.stroke] * 100) * priorityWeight(selected, eventKey) - (lockedHere ? 1_000_000_000_000_000 : 0), { swimmerId: s.id, slotId: slot.id });
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
        return swimmer ? { stroke, swimmer, time: swimmer.times[stroke], position: leg } : null;
      }).filter((leg): leg is Leg => Boolean(leg));
      return { label: String.fromCharCode(65 + team), legs, total: legs.reduce((sum, leg) => sum + leg.time, 0) };
    });
    // Balance only by exchanging the already-selected fastest swimmers on identical strokes.
    const score = () => { const avg = teams.reduce((sum, t) => sum + t.total, 0) / teams.length; return teams.reduce((sum, t) => sum + (t.total - avg) ** 2, 0); };
    for (let pass = 0; pass < 12; pass++) for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) {
      for (let ai = 0; ai < teams[a].legs.length; ai++) for (let bi = 0; bi < teams[b].legs.length; bi++) {
        const la = teams[a].legs[ai], lb = teams[b].legs[bi];
        if (la.stroke !== lb.stroke || relayLocks(la.swimmer).some(lock => lock.event === eventKey) || relayLocks(lb.swimmer).some(lock => lock.event === eventKey)) continue;
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
  const lockedMissing = active.some(s => relayLocks(s).some(lock => selected.includes(lock.event) && lock.team < teamCount && assignments.get(`${lock.event}-${lock.team}-${lock.leg}`)?.id !== s.id));
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
  const [optimizationNames, setOptimizationNames] = useState<Record<Gender, string>>({ Women: "Women's Relay Optimizer", Men: "Men's Relay Optimizer" });
  const [results, setResults] = useState<RelayResult[]>([]);
  const [warning, setWarning] = useState("");
  const [saved, setSaved] = useState(true);
  const [rosterMessage, setRosterMessage] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const setupInput = useRef<HTMLInputElement>(null);
  const setupHandles = useRef<Record<Gender, SetupFileHandle | null>>({ Women: null, Men: null });
  useEffect(() => { const raw = localStorage.getItem("relay-room-roster"); if (raw) try { setSwimmers(JSON.parse(raw).map((s: Swimmer & { gender: Gender | "Girls" | "Boys" }) => ({ ...s, gender: s.gender === "Girls" ? "Women" : s.gender === "Boys" ? "Men" : s.gender }))); } catch {} }, []);
  useEffect(() => { const raw = localStorage.getItem("relay-room-optimization-names"); if (raw) try { setOptimizationNames(current => ({ ...current, ...JSON.parse(raw) })); } catch {} }, []);
  useEffect(() => { if (!saved) { const timer = setTimeout(() => { localStorage.setItem("relay-room-roster", JSON.stringify(swimmers)); localStorage.setItem("relay-room-optimization-names", JSON.stringify(optimizationNames)); setSaved(true); }, 400); return () => clearTimeout(timer); } }, [swimmers, optimizationNames, saved]);
  const roster = swimmers.filter(s => s.gender === gender);
  const update = (id: string, patch: Partial<Swimmer>) => { setSwimmers(all => all.map(s => s.id === id ? { ...s, ...patch } : s)); setSaved(false); };
  const moveEvent = (eventKey: EventKey, direction: -1 | 1) => setEvents(current => {
    const index = current.indexOf(eventKey), target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const run = () => { const out = optimize(roster, events, teamCount, mode, cap); setResults(out.results); setWarning(out.warning); document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }); };
  const add = () => { const n: Swimmer = { id: crypto.randomUUID(), name: "New swimmer", gender, unavailable: false, excludedEvents: [], relayLocks: [], times: { back: 30, breast: 33, fly: 29, free50: 27, free100: 59 } }; setSwimmers(s => [...s, n]); setSaved(false); };
  const remove = (swimmer: Swimmer) => {
    if (!window.confirm(`Remove ${swimmer.name || "this swimmer"} from the ${gender.toLowerCase()}’s roster?`)) return;
    setSwimmers(current => current.filter(s => s.id !== swimmer.id));
    setResults([]); setWarning(""); setSaved(false); setRosterMessage(`${swimmer.name || "Swimmer"} removed from the roster.`);
  };
  const newRoster = () => {
    if (roster.length && !window.confirm(`Create a new ${gender.toLowerCase()}’s roster? This will remove all ${roster.length} current entries.`)) return;
    setSwimmers(current => current.filter(s => s.gender !== gender));
    setupHandles.current[gender] = null;
    setResults([]); setWarning(""); setSaved(false); setRosterMessage(`New empty ${gender.toLowerCase()}’s roster created. Use Add swimmer or Import CSV to fill it.`);
  };
  const toggleLineupLock = (swimmer: Swimmer, eventKey: EventKey, team: number, leg: number) => {
    const isLockedHere = relayLocks(swimmer).some(lock => lock.event === eventKey && lock.team === team && lock.leg === leg);
    const next = swimmers.map(s => {
      let locks = relayLocks(s);
      if (s.id === swimmer.id) {
        locks = locks.filter(lock => lock.event !== eventKey);
        if (!isLockedHere) locks = [...locks, { event: eventKey, team, leg }];
      } else if (!isLockedHere && s.gender === gender) {
        locks = locks.filter(lock => lock.event !== eventKey || lock.team !== team || lock.leg !== leg);
      }
      return { ...s, relayLocks: locks, lockEvent: "" as const, lockStroke: "" as const, lockLeg: null };
    });
    setSwimmers(next); setSaved(false);
    const out = optimize(next.filter(s => s.gender === gender), events, teamCount, mode, cap);
    setResults(out.results); setWarning(out.warning);
    setRosterMessage(`${swimmer.name} ${isLockedHere ? "unlocked from" : "locked into"} ${eventName(eventKey)} team ${String.fromCharCode(65 + team)}, leg ${leg + 1}.`);
  };
  const addRosterLock = (swimmer: Swimmer, eventKey: EventKey, team: number, leg: number) => {
    const next = swimmers.map(s => {
      let locks = relayLocks(s);
      if (s.id === swimmer.id) locks = [...locks.filter(lock => lock.event !== eventKey), { event: eventKey, team, leg }];
      else if (s.gender === gender) locks = locks.filter(lock => lock.event !== eventKey || lock.team !== team || lock.leg !== leg);
      return { ...s, relayLocks: locks, lockEvent: "" as const, lockStroke: "" as const, lockLeg: null };
    });
    setSwimmers(next); setSaved(false);
    if (results.length) { const out = optimize(next.filter(s => s.gender === gender), events, teamCount, mode, cap); setResults(out.results); setWarning(out.warning); }
    setRosterMessage(`${swimmer.name} locked into ${eventName(eventKey)} team ${String.fromCharCode(65 + team)}, ${eventKey === "medley" ? strokeName(EVENTS.find(item => item.key === eventKey)!.legs[leg]) : `leg ${leg + 1}`}.`);
  };
  const removeRosterLock = (swimmer: Swimmer, lockToRemove: RelayLock) => {
    const next = swimmers.map(s => s.id !== swimmer.id ? s : { ...s, relayLocks: relayLocks(s).filter(lock => lock.event !== lockToRemove.event || lock.team !== lockToRemove.team || lock.leg !== lockToRemove.leg), lockEvent: "" as const, lockStroke: "" as const, lockLeg: null });
    setSwimmers(next); setSaved(false);
    if (results.length) { const out = optimize(next.filter(s => s.gender === gender), events, teamCount, mode, cap); setResults(out.results); setWarning(out.warning); }
    setRosterMessage(`${swimmer.name}’s ${eventName(lockToRemove.event)} lock removed.`);
  };
  const moveFreeLeg = (eventKey: EventKey, teamIndex: number, position: number, direction: -1 | 1) => {
    if (eventKey === "medley") return;
    setResults(current => current.map(result => result.event !== eventKey ? result : {
      ...result,
      teams: result.teams.map((team, index) => {
        if (index !== teamIndex) return team;
        const from = team.legs.findIndex(leg => leg.position === position);
        const to = team.legs.findIndex(leg => leg.position === position + direction);
        if (from < 0 || to < 0) return team;
        const moving = team.legs[from], adjacent = team.legs[to];
        const movingLocked = relayLocks(moving.swimmer).some(lock => lock.event === eventKey && lock.team === teamIndex && lock.leg === moving.position);
        const adjacentLocked = relayLocks(adjacent.swimmer).some(lock => lock.event === eventKey && lock.team === teamIndex && lock.leg === adjacent.position);
        if (movingLocked || adjacentLocked) return team;
        const legs = [...team.legs];
        legs[from] = { ...moving, swimmer: adjacent.swimmer, time: adjacent.time };
        legs[to] = { ...adjacent, swimmer: moving.swimmer, time: moving.time };
        return { ...team, legs };
      }),
    }));
    setSaved(false); setRosterMessage(`${eventName(eventKey)} team ${String.fromCharCode(65 + teamIndex)} order updated.`);
  };
  const setupJson = () => JSON.stringify({
    version: 2,
    savedAt: new Date().toISOString(),
    optimizationName: optimizationNames[gender],
    activeRoster: gender,
    selections: { events, teamCount, mode, maximumAppearances: cap },
    swimmers,
    generatedLineup: results.map(result => ({ event: result.event, teams: result.teams.map(team => ({ label: team.label, legs: team.legs.map(leg => ({ stroke: leg.stroke, swimmerId: leg.swimmer.id, position: leg.position })) })) })),
  }, null, 2);
  const suggestedSetupName = () => {
    const name = optimizationNames[gender].trim();
    if (!name || name === "Women's Relay Optimizer" || name === "Men's Relay Optimizer") return gender === "Women" ? "womens_relay_optimizer.json" : "mens_relay_optimizer.json";
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return `${safe || (gender === "Women" ? "womens_relay_optimizer" : "mens_relay_optimizer")}.json`;
  };
  const downloadSetup = (contents: string) => {
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = suggestedSetupName(); link.click(); URL.revokeObjectURL(url);
    setRosterMessage(`Saved both rosters and the current optimizer selections to ${link.download}.`);
  };
  const saveToHandle = async (handle: SetupFileHandle, contents: string, rosterGender: Gender) => {
    const writable = await handle.createWritable(); await writable.write(contents); await writable.close();
    setupHandles.current[rosterGender] = handle; setRosterMessage(`Saved ${rosterGender.toLowerCase()}’s setup to ${handle.name}.`);
  };
  const saveAsSetup = async () => {
    const contents = setupJson(); const picker = (window as PickerWindow).showSaveFilePicker;
    if (!picker) return downloadSetup(contents);
    try {
      const handle = await picker.call(window, { suggestedName: suggestedSetupName(), types: [{ description: "Relay Optimizer setup", accept: { "application/json": [".json"] } }] });
      await saveToHandle(handle, contents, gender);
    } catch (error) { if ((error as Error).name !== "AbortError") setRosterMessage("The setup could not be saved."); }
  };
  const saveSetup = async () => {
    const handle = setupHandles.current[gender];
    if (!handle) return saveAsSetup();
    try { await saveToHandle(handle, setupJson(), gender); }
    catch { setupHandles.current[gender] = null; setRosterMessage(`The ${gender.toLowerCase()}’s setup file is no longer available. Choose Save As to select it again.`); }
  };
  const applySetup = (raw: string, handle?: SetupFileHandle) => {
    const data = JSON.parse(raw) as SetupFile;
    if (!Array.isArray(data.swimmers) || !data.selections || !Array.isArray(data.selections.events)) throw new Error("This is not a valid Relay Optimizer setup file.");
    const migrated = data.swimmers.map(s => ({ ...s, gender: (s.gender as Gender | "Girls" | "Boys") === "Girls" ? "Women" as const : (s.gender as Gender | "Girls" | "Boys") === "Boys" ? "Men" as const : s.gender }));
    const activeRoster = (data.activeRoster as Gender | "Girls" | "Boys") === "Girls" ? "Women" : (data.activeRoster as Gender | "Girls" | "Boys") === "Boys" ? "Men" : data.activeRoster;
    const swimmerById = new Map(migrated.map(swimmer => [swimmer.id, swimmer]));
    const restoredLineup = (data.generatedLineup || []).map(result => ({
      event: result.event,
      teams: result.teams.map(team => {
        const legs = team.legs.map(savedLeg => {
          const swimmer = swimmerById.get(savedLeg.swimmerId);
          return swimmer ? { stroke: savedLeg.stroke, swimmer, position: savedLeg.position, time: swimmer.times[savedLeg.stroke] } : null;
        }).filter((leg): leg is Leg => Boolean(leg));
        return { label: team.label, legs, total: legs.reduce((sum, leg) => sum + leg.time, 0) };
      }),
    }));
    setSwimmers(migrated); setGender(activeRoster); setEvents(data.selections.events); setTeamCount(data.selections.teamCount); setMode(data.selections.mode); setCap(data.selections.maximumAppearances); setResults(restoredLineup); setWarning(""); setSaved(false);
    if (data.optimizationName?.trim()) setOptimizationNames(current => ({ ...current, [activeRoster]: data.optimizationName!.trim() }));
    setupHandles.current[activeRoster] = handle || null; setRosterMessage(`Opened ${activeRoster.toLowerCase()}’s setup${handle?.name ? ` from ${handle.name}` : ""}${restoredLineup.length ? " with its saved lineup" : ""}.`);
  };
  const openSetup = async () => {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) return setupInput.current?.click();
    try { const [handle] = await picker.call(window, { multiple: false, types: [{ description: "Relay Optimizer setup", accept: { "application/json": [".json"] } }] }); applySetup(await (await handle.getFile()).text(), handle); }
    catch (error) { if ((error as Error).name !== "AbortError") setRosterMessage(error instanceof Error ? error.message : "That setup could not be opened."); }
  };
  const openFallbackSetup = async (file?: File) => {
    if (!file) return;
    try { applySetup(await file.text()); } catch (error) { setRosterMessage(error instanceof Error ? error.message : "That setup could not be opened."); }
    finally { if (setupInput.current) setupInput.current.value = ""; }
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
  const assignments = useMemo(() => {
    const bySwimmer = new Map<string, string[]>();
    results.forEach(result => result.teams.forEach((team, teamIndex) => team.legs.forEach(leg => {
      const position = result.event === "medley" ? strokeName(leg.stroke) : `Leg ${leg.position + 1}`;
      const label = `${eventName(result.event)} · ${String.fromCharCode(65 + teamIndex)} · ${position}`;
      bySwimmer.set(leg.swimmer.id, [...(bySwimmer.get(leg.swimmer.id) || []), label]);
    })));
    return bySwimmer;
  }, [results]);
  const spread = useMemo(() => results.flatMap(r => r.teams).length ? Math.max(...results.flatMap(r => r.teams).map(t => t.total)) - Math.min(...results.flatMap(r => r.teams).map(t => t.total)) : 0, [results]);
  const releaseDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${laneLinesRelease.created}T12:00:00`));

  return <main>
    <header className="topbar"><div className="brand"><span className="mark" aria-hidden="true">≋</span><span className="brand-copy"><span>Lane Lines</span><small>Relay Optimizer</small></span></div><div className="topbar-actions"><div className="save"><span className={saved ? "dot" : "dot pending"}/>{saved ? "Saved on this device" : "Saving changes…"}</div><nav className="tool-menu" aria-label="Relay optimizer navigation"><a href="https://stebb1976.github.io/Lane-Lines/">Lane Lines</a><button type="button" onClick={() => setShowAbout(true)}>About</button></nav></div></header>
    <section className="hero">
      <div><p className="eyebrow">LANE LINES · MEET TOOLS</p><h1>Build the right relay.<br/><em>Every time.</em></h1><p className="lede">Turn your roster into fast, fair, rule-ready relay teams in seconds.</p></div>
      <div className="hero-stats"><div><b>{roster.filter(s => !s.unavailable).length}</b><span>eligible swimmers</span></div><div><b>{events.length}</b><span>relay events</span></div><div><b>{teamCount}</b><span>teams per event</span></div></div>
    </section>
    <section className="workspace">
      <div className="controls card">
        <div className="section-title"><span>01</span><div><h2>Meet setup</h2><p>Choose how today’s relays should run.</p></div></div>
        <label>Roster</label><div className="segmented"><button className={gender === "Women" ? "active" : ""} onClick={() => { setGender("Women"); setResults([]); }}>Women</button><button className={gender === "Men" ? "active" : ""} onClick={() => { setGender("Men"); setResults([]); }}>Men</button></div>
        <label htmlFor="optimization-name">Optimization name</label><input id="optimization-name" className="optimization-name" value={optimizationNames[gender]} maxLength={80} onChange={e => { setOptimizationNames(current => ({ ...current, [gender]: e.target.value })); setSaved(false); }} />
        <label>Relay events · priority order</label><div className="event-checks">{[...events.map(key => EVENTS.find(e => e.key === key)!), ...EVENTS.filter(e => !events.includes(e.key))].map(e => { const priority = events.indexOf(e.key); return <div className={`event-row ${priority >= 0 ? "chosen" : ""}`} key={e.key}><button className="event-toggle" onClick={() => setEvents(v => v.includes(e.key) ? v.filter(x => x !== e.key) : [...v, e.key])}><span>{priority >= 0 ? priority + 1 : "+"}</span>{e.short}</button>{priority >= 0 && <div className="event-order"><button aria-label={`Move ${e.short} up`} disabled={priority === 0} onClick={() => moveEvent(e.key, -1)}>↑</button><button aria-label={`Move ${e.short} down`} disabled={priority === events.length - 1} onClick={() => moveEvent(e.key, 1)}>↓</button></div>}</div>})}</div>
        <label>Teams per event</label><div className="number-row">{[1,2,3,4].map(n => <button key={n} className={teamCount === n ? "active" : ""} onClick={() => setTeamCount(n)}>{n}<small>{String.fromCharCode(64+n)}</small></button>)}</div>
        <label>Optimization goal</label><div className="mode-cards"><button className={mode === "ranked" ? "active" : ""} onClick={() => setMode("ranked")}><b>Ranked</b><span>Fastest total time across every lineup</span></button><button className={mode === "balanced" ? "active" : ""} onClick={() => setMode("balanced")}><b>Balanced</b><span>Fastest swimmer pool, balanced across teams</span></button></div>
        <label>Maximum appearances</label><div className="cap"><span>Across the full meet</span><div>{[2,3].map(n => <button key={n} className={cap === n ? "active" : ""} onClick={() => setCap(n)}>{n}</button>)}</div></div>
        <button className="optimize" onClick={run} disabled={!events.length}>Optimize full meet <span>→</span></button>
      </div>
      <div className="roster card">
        <div className="section-title roster-head"><span>02</span><div><h2>{gender}’s roster</h2><p>Edit seed times, availability, exclusions, and exact relay locks.</p></div><div className="roster-actions"><input ref={importInput} type="file" accept=".csv,text/csv" aria-label="Import roster CSV" onChange={e => importRoster(e.target.files?.[0])}/><input ref={setupInput} type="file" accept=".json,application/json" aria-label="Open relay optimizer setup" onChange={e => openFallbackSetup(e.target.files?.[0])}/><button className="new-roster" onClick={newRoster}>New roster</button><button onClick={() => importInput.current?.click()}>Import CSV</button><button onClick={openSetup}>Open setup</button><button onClick={saveSetup}>Save</button><button onClick={saveAsSetup}>Save As</button><button className="add-swimmer" onClick={add}>＋ Add swimmer</button></div></div>
        <div className="table-wrap"><table><thead><tr><th>Swimmer</th><th>Assigned relays</th><th>Relay locks</th>{STROKES.map(s => <th key={s.key}>{s.label}</th>)}<th>Availability</th><th>Exclude from</th><th>Remove</th></tr></thead><tbody>{roster.map(s => <tr key={s.id} className={s.unavailable ? "muted" : ""}><td><input className="name" value={s.name} aria-label="Swimmer name" onChange={e => update(s.id, { name: e.target.value })}/></td><td><div className="relay-assignments">{(assignments.get(s.id) || []).map(label => <span key={label}>{label}</span>)}{!assignments.has(s.id) && <small>Optimize to see assignments</small>}</div></td><td><RosterLocks swimmer={s} teamCount={teamCount} onAdd={(eventKey, team, leg) => addRosterLock(s, eventKey, team, leg)} onRemove={lock => removeRosterLock(s, lock)}/></td>{STROKES.map(st => <td key={st.key}><TimeInput value={s.times[st.key]} label={`${s.name} ${st.label}`} onCommit={value => update(s.id, { times: { ...s.times, [st.key]: value } })}/></td>)}<td><button className={`availability ${s.unavailable ? "out" : ""}`} onClick={() => update(s.id, { unavailable: !s.unavailable })}>{s.unavailable ? "Out" : "Ready"}</button></td><td><div className="exclude-events">{EVENTS.map(event => { const excluded = (s.excludedEvents || []).includes(event.key); return <button key={event.key} className={excluded ? "excluded" : ""} aria-pressed={excluded} aria-label={`${excluded ? "Allow" : "Exclude"} ${s.name} ${event.name}`} title={event.short} onClick={() => update(s.id, { excludedEvents: excluded ? (s.excludedEvents || []).filter(key => key !== event.key) : [...(s.excludedEvents || []), event.key] })}>{event.key === "medley" ? "M" : event.key === "free200" ? "2F" : "4F"}</button>})}</div></td><td><button className="remove-swimmer" aria-label={`Remove ${s.name}`} title={`Remove ${s.name}`} onClick={() => remove(s)}>×</button></td></tr>)}</tbody></table></div>
        <p className="hint">Times are in seconds. Swipe or scroll the table sideways on smaller screens. Changes save automatically to this device. CSV imports replace each roster included in the file.</p>
        {rosterMessage && <p className="roster-message" role="status">{rosterMessage}</p>}
      </div>
    </section>
    <section id="results" className="results-section">
      <div className="results-head"><div><p className="eyebrow">THE LINEUP</p><h2>{results.length ? `${optimizationNames[gender] || gender} · ${mode === "ranked" ? "Ranked" : "Balanced"} teams` : "Your optimized relays will appear here"}</h2></div>{results.length > 0 && <div className="result-meta"><span>{cap} max appearances</span>{mode === "balanced" && <span>{spread.toFixed(2)}s total range</span>}</div>}</div>
      {warning && <div className="warning">⚠ {warning} Try fewer teams, a higher appearance cap, or make more swimmers available.</div>}
      {!results.length ? <div className="empty"><div>↗</div><p>Select your meet setup, check the roster, then optimize.</p></div> : <div className="relay-list">{results.map(result => <article key={result.event} className="relay-block"><div className="relay-title"><h3>{eventName(result.event)}</h3><span>{result.teams.length} teams · lock a swimmer to keep that exact relay position</span></div><div className="team-grid">{result.teams.map((team, ti) => <div className={`team-card ${ti === 0 && mode === "ranked" ? "top" : ""}`} key={team.label}><div className="team-top"><div><span>TEAM</span><b>{team.label}</b></div><strong>{team.legs.length === 4 ? fmt(team.total) : "Incomplete"}</strong></div><ol>{team.legs.map((leg, i) => { const positionLocked = (position: number) => team.legs.some(candidate => candidate.position === position && relayLocks(candidate.swimmer).some(lock => lock.event === result.event && lock.team === ti && lock.leg === position)); const locked = positionLocked(leg.position); return <li key={`${leg.swimmer.id}-${i}`} className={locked ? "locked-leg" : ""}><span className="legnum">{leg.position + 1}</span><div><b>{leg.swimmer.name}</b><small>{strokeName(leg.stroke)}</small></div><time>{leg.time.toFixed(2)}</time>{result.event !== "medley" && <div className="lineup-order"><button disabled={leg.position === 0 || locked || positionLocked(leg.position - 1)} aria-label={`Move ${leg.swimmer.name} earlier in ${eventName(result.event)} team ${team.label}`} onClick={() => moveFreeLeg(result.event, ti, leg.position, -1)}>↑</button><button disabled={leg.position === 3 || locked || positionLocked(leg.position + 1)} aria-label={`Move ${leg.swimmer.name} later in ${eventName(result.event)} team ${team.label}`} onClick={() => moveFreeLeg(result.event, ti, leg.position, 1)}>↓</button></div>}<button className={`lineup-lock ${locked ? "active" : ""}`} aria-pressed={locked} aria-label={`${locked ? "Unlock" : "Lock"} ${leg.swimmer.name} in ${eventName(result.event)} team ${team.label}, leg ${leg.position + 1}`} title={locked ? "Unlock this position" : "Lock this position"} onClick={() => toggleLineupLock(leg.swimmer, result.event, ti, leg.position)}>{locked ? "🔒" : "○"}</button></li>})}</ol></div>)}</div></article>)}</div>}
    </section>
    <footer><div className="brand"><span className="mark" aria-hidden="true">≋</span><span className="brand-copy"><span>Lane Lines</span><small>Relay Optimizer</small></span></div><p>Built for coaches. Data stays on your device.</p></footer>
    {showAbout && <div className="about-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAbout(false); }}><section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title"><p className="about-mark" aria-hidden="true">≋</p><h2 id="about-title">Lane Lines</h2><dl><div><dt>Author</dt><dd>Stephen Stebbins</dd></div><div><dt>Version</dt><dd>{laneLinesRelease.version}</dd></div><div><dt>Version date</dt><dd>{releaseDate}</dd></div></dl><button type="button" onClick={() => setShowAbout(false)}>Close</button></section></div>}
  </main>;
}
