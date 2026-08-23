import { memo, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  History as HistoryIcon,
  MessageCircleHeart,
  ScrollText,
  PenTool,
  TrendingUp,
} from "lucide-react";
import { useNav, usePrefs } from "../lib/store";
import { useDocuments, useActivity, useUsage } from "../lib/data";
import type { ActivityType, BotId } from "../lib/types";
import { fmtBytes, fmtWords, cx } from "../lib/utils";
import {
  Panel,
  Badge,
  Progress,
  Skeleton,
  Tabs,
  EmptyState,
  Button,
  Eyebrow,
} from "../components/ui";
import { ActivityLine, CoverArt } from "../components/bits";

const DAY = 86_400_000;

export default function Insights() {
  const view = useNav((s) => s.view);
  // Tab state lives HERE, not in the router: switching tabs must never
  // remount this view. Deep links (header menu → History) sync the tab.
  const [tab, setTab] = useState<"analytics" | "history">(
    view === "history" ? "history" : "analytics",
  );
  useEffect(() => {
    setTab(useNav.getState().view === "history" ? "history" : "analytics");
  }, [view]);
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
      <div className="mb-8 sm:mb-9">
        <Eyebrow className="mb-3">The ledger</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 tracking-tight leading-[1.05]">
              Insights
            </h1>
            <p className="text-sm text-mist-500 mt-2.5 max-w-md leading-relaxed">
              A quiet ledger of your reading life — and of the companions’ work.
            </p>
          </div>
          <Badge tone="muted">
            <TrendingUp className="w-3 h-3" />
            local-first
          </Badge>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={(id) => setTab(id as "analytics" | "history")}
        tabs={[
          {
            id: "analytics",
            label: "Analytics",
            icon: <BarChart3 className="w-3.5 h-3.5" />,
          },
          {
            id: "history",
            label: "History",
            icon: <HistoryIcon className="w-3.5 h-3.5" />,
          },
        ]}
      />
      <div className="mt-7 sm:mt-8">
        {tab === "analytics" ? <Analytics /> : <HistoryView />}
      </div>
    </div>
  );
}

/* ---------------- custom charts (no external chart lib — smaller, crash-free) ---------------- */

/** Pure-SVG bar chart with hover readout. Memoized on its data identity. */
const Bars = memo(function Bars({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 560;
  const H = 200;
  const pad = { l: 6, r: 6, t: 18, b: 26 };
  const bw = (W - pad.l - pad.r) / data.length;
  const active = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      {active && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] font-display text-gold-300 bg-ink-800 border border-gold-700/50 rounded-md px-2 py-0.5 pointer-events-none whitespace-nowrap shadow-card z-10">
          {active.label} · {active.value} event{active.value === 1 ? "" : "s"}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-40 sm:h-44"
        role="img"
        aria-label="Activity over the last 14 days"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + (H - pad.t - pad.b) * (1 - g)}
            y2={pad.t + (H - pad.t - pad.b) * (1 - g)}
            stroke="#2a2636"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
        {data.map((d, i) => {
          const h = Math.max(2, ((H - pad.t - pad.b) * d.value) / max);
          const x = pad.l + i * bw + bw * 0.18;
          const y = H - pad.b - h;
          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={pad.l + i * bw}
                y={pad.t}
                width={bw}
                height={H - pad.t - pad.b}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={bw * 0.64}
                height={h}
                rx="3"
                fill={hover === i ? "#f0d99a" : "#d9ad52"}
                style={{ transition: "fill 0.15s ease" }}
              />
              {hover === i && (
                <rect
                  x={x - 2}
                  y={y - 2}
                  width={bw * 0.64 + 4}
                  height={h + 4}
                  rx="4"
                  fill="none"
                  stroke="#f0d99a"
                  strokeWidth="1"
                  strokeOpacity="0.5"
                />
              )}
              {i % 2 === 0 && (
                <text
                  x={pad.l + i * bw + bw / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#847f76"
                  fontFamily="Space Grotesk"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
});

/** Pure-SVG donut. Memoized. */
const Donut = memo(function Donut({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const total = Math.max(
    1,
    data.reduce((a, d) => a + d.value, 0),
  );
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg
      viewBox="0 0 140 140"
      className="w-32 h-32 sm:w-36 sm:h-36 mx-auto"
      role="img"
      aria-label="Companion usage share"
    >
      <circle
        cx="70"
        cy="70"
        r={R}
        fill="none"
        stroke="#2a2636"
        strokeWidth="18"
      />
      {data.map((d) => {
        const frac = d.value / total;
        const dash = frac * C;
        const el = (
          <circle
            key={d.name}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={d.color}
            strokeWidth="18"
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        );
        offset += dash;
        return el;
      })}
      <text
        x="70"
        y="66"
        textAnchor="middle"
        fontSize="22"
        fontWeight="600"
        fill="#f5f1ea"
        fontFamily="Space Grotesk"
      >
        {total}
      </text>
      <text
        x="70"
        y="83"
        textAnchor="middle"
        fontSize="9"
        fill="#847f76"
        fontFamily="Space Grotesk"
        letterSpacing="1"
      >
        CALLS
      </text>
    </svg>
  );
});

function BigStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={cx("px-4 sm:px-6 py-5 sm:py-6", accent && "bg-gold-500/3")}>
      <p className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-600">
        {label}
      </p>
      <p
        className={cx(
          "font-display font-semibold text-2xl sm:text-[1.9rem] leading-none tabular-nums mt-2.5",
          accent ? "text-gold-300" : "text-mist-100",
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-mist-500 mt-2 leading-relaxed">{sub}</p>
      )}
    </div>
  );
}

/* ---------------- analytics ---------------- */

function Analytics() {
  const docsQ = useDocuments();
  const actQ = useActivity(500);
  const usageQ = useUsage();
  const prefs = usePrefs((s) => s.prefs);
  const openDoc = useNav((s) => s.openDoc);

  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const activity = useMemo(() => actQ.data ?? [], [actQ.data]);
  const usage = useMemo(() => usageQ.data ?? [], [usageQ.data]);

  const totalWords = docs.reduce((a, d) => a + d.wordCount, 0);
  const totalBytes = docs.reduce((a, d) => a + d.byteSize, 0);
  const finished = docs.filter((d) => d.readingProgress >= 99.5).length;
  const wordsRead = docs.reduce(
    (a, d) => a + (d.wordCount * d.readingProgress) / 100,
    0,
  );
  const minutesRead = Math.round(wordsRead / 230);

  const trend = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(Date.now() - i * DAY);
      const start = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
      ).getTime();
      const n = activity.filter(
        (a) => a.createdAt >= start && a.createdAt < start + DAY,
      ).length;
      days.push({ label: String(day.getDate()), value: n });
    }
    return days;
  }, [activity]);

  const botData = useMemo(() => {
    const counts: Record<BotId, number> = { luma: 0, ouro: 0, ankaa: 0 };
    for (const u of usage) counts[u.bot]++;
    return [
      { name: "Luma", value: counts.luma, color: "#d9ad52" },
      { name: "Ouro", value: counts.ouro, color: "#6d84e8" },
      { name: "Ankaa", value: counts.ankaa, color: "#db814c" },
    ].filter((b) => b.value > 0);
  }, [usage]);

  const onlineCalls = usage.filter((u) => u.status === "ok").length;
  const offlineCalls = usage.filter((u) => u.status === "offline").length;
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const usedToday = usage.filter(
    (u) => u.createdAt >= dayStart && u.status === "ok",
  ).length;
  const avgLatency = onlineCalls
    ? Math.round(
        usage
          .filter((u) => u.status === "ok")
          .reduce((a, u) => a + u.latencyMs, 0) / onlineCalls,
      )
    : 0;

  const shelf = useMemo(
    () =>
      [...docs]
        .sort((a, b) => b.readingProgress - a.readingProgress)
        .slice(0, 6),
    [docs],
  );

  if (docsQ.loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ─── big-numeral ledger ─── */}
      <Panel className="overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-ink-700/70">
          <div className="bg-ink-850">
            <BigStat label="Documents" value={String(docs.length)} />
          </div>
          <div className="bg-ink-850">
            <BigStat
              label="Words shelved"
              value={fmtWords(totalWords).replace(" words", "")}
            />
          </div>
          <div className="bg-ink-850">
            <BigStat
              label="Words read"
              value={fmtWords(Math.round(wordsRead)).replace(" words", "")}
              sub={`≈ ${minutesRead >= 60 ? `${(minutesRead / 60).toFixed(1)}h` : `${minutesRead}m`} in the chair`}
              accent
            />
          </div>
          <div className="bg-ink-850">
            <BigStat label="Finished" value={String(finished)} />
          </div>
          <div className="bg-ink-850">
            <BigStat label="On device" value={fmtBytes(totalBytes)} />
          </div>
        </div>
      </Panel>

      {/* ─── charts row ─── */}
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 sm:gap-6">
        <Panel className="p-5 sm:p-6 hover-lift">
          <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
            <h2 className="font-display text-sm uppercase tracking-[0.16em] text-mist-400">
              Activity · last 14 days
            </h2>
            <Badge tone="muted">{activity.length} events total</Badge>
          </div>
          <Bars data={trend} />
        </Panel>

        <Panel className="p-5 sm:p-6 hover-lift">
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-mist-400 mb-5">
            Companion usage
          </h2>
          {botData.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-xl border border-ink-600 bg-ink-800 flex items-center justify-center text-mist-500 mx-auto mb-3">
                <MessageCircleHeart className="w-5 h-5" />
              </div>
              <p className="text-sm text-mist-500 max-w-56 mx-auto leading-relaxed">
                No companion calls yet — open the reader and say hello to Luma.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 items-center">
              <Donut data={botData} />
              <ul className="space-y-2">
                {botData.map((b) => (
                  <li
                    key={b.name}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: b.color }}
                    />
                    <span className="text-mist-300 font-display">{b.name}</span>
                    <span className="ml-auto text-mist-500 tabular-nums">
                      {b.value} call{b.value === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-ink-700/70 space-y-2 text-xs text-mist-500">
            <p className="flex justify-between">
              <span>Model calls (online)</span>
              <span className="text-mist-300 tabular-nums">{onlineCalls}</span>
            </p>
            <p className="flex justify-between">
              <span>Offline engine calls</span>
              <span className="text-mist-300 tabular-nums">{offlineCalls}</span>
            </p>
            <p className="flex justify-between">
              <span>Avg latency</span>
              <span className="text-mist-300 tabular-nums">
                {avgLatency ? `${(avgLatency / 1000).toFixed(1)}s` : "—"}
              </span>
            </p>
            <div className="pt-3 mt-1 border-t border-ink-700/50">
              <p className="flex justify-between mb-1.5">
                <span>Today’s quota</span>
                <span className="text-gold-300 tabular-nums">
                  {usedToday}/{prefs.dailyQuota}
                </span>
              </p>
              <Progress
                value={(usedToday / Math.max(1, prefs.dailyQuota)) * 100}
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* ─── shelf by progress ─── */}
      <Panel className="p-5 sm:p-6 hover-lift">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-mist-400">
            The shelf, by progress
          </h2>
          {docs.length > 0 && <Badge tone="muted">top {shelf.length}</Badge>}
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-mist-500 py-6 text-center">
            Import documents to see them ranked here.
          </p>
        ) : (
          <ul className="space-y-3">
            {shelf.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => openDoc(d.id)}
                  className="w-full flex items-center gap-3 sm:gap-4 group min-h-11"
                >
                  <CoverArt
                    doc={d}
                    className="w-8 h-11 sm:w-9 sm:h-12 shrink-0"
                    showInitial={false}
                  />
                  <span className="text-sm text-mist-300 group-hover:text-gold-300 transition-colors truncate flex-1 sm:flex-none sm:w-44 lg:w-64 text-left">
                    {d.title}
                  </span>
                  <Progress
                    value={d.readingProgress}
                    className="flex-1"
                    tone={d.readingProgress >= 99.5 ? "ok" : "gold"}
                  />
                  <span className="text-xs text-mist-500 tabular-nums w-10 text-right shrink-0">
                    {Math.round(d.readingProgress)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- history ---------------- */

const FILTERS: { id: string; label: string; types: ActivityType[] | null }[] = [
  { id: "all", label: "Everything", types: null },
  { id: "import", label: "Imports", types: ["upload"] },
  { id: "reading", label: "Reading", types: ["read", "finish"] },
  { id: "notes", label: "Notes & marks", types: ["bookmark", "annotation"] },
  {
    id: "ai",
    label: "Companions",
    types: ["summary", "scenes", "analyze", "story"],
  },
];

function HistoryView() {
  const actQ = useActivity(400);
  const [filter, setFilter] = useState("all");
  const openDoc = useNav((s) => s.openDoc);

  const rows = useMemo(() => {
    const all = actQ.data ?? [];
    const f = FILTERS.find((x) => x.id === filter);
    return f?.types ? all.filter((a) => f.types!.includes(a.type)) : all;
  }, [actQ.data, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const d = new Date(r.createdAt);
      const today = new Date();
      const yest = new Date(Date.now() - DAY);
      const label =
        d.toDateString() === today.toDateString()
          ? "Today"
          : d.toDateString() === yest.toDateString()
            ? "Yesterday"
            : d.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
      const arr = map.get(label) ?? [];
      arr.push(r);
      map.set(label, arr);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div>
      <div
        className="flex flex-wrap gap-2 mb-7"
        role="group"
        aria-label="Filter history"
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={cx(
                "px-3.5 py-2 rounded-lg border text-xs font-display tracking-wide transition-all min-h-10",
                active
                  ? "border-gold-600 text-gold-300 bg-gold-500/10 shadow-[0_0_20px_-10px_var(--acc-glow)]"
                  : "border-ink-600 text-mist-400 hover:text-mist-200 hover:border-ink-500 bg-ink-850/40",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {actQ.error ? (
        <Panel>
          <EmptyState
            icon={<HistoryIcon className="w-6 h-6" />}
            title="The diary won’t open"
            body={actQ.error}
            action={
              <Button variant="gold" onClick={actQ.retry}>
                Try again
              </Button>
            }
          />
        </Panel>
      ) : actQ.loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<HistoryIcon className="w-6 h-6" />}
            title="A blank diary"
            body="Every import, reading session, bookmark, annotation and companion call will be written here."
          />
        </Panel>
      ) : (
        <div className="space-y-7 sm:space-y-8">
          {groups.map(([label, items]) => (
            <section key={label}>
              <h2 className="text-[11px] font-display uppercase tracking-[0.2em] text-gold-400 mb-3 flex items-center gap-3">
                {label}
                <span className="text-[10px] text-mist-600 tabular-nums">
                  {items.length}
                </span>
                <span className="gold-rule flex-1" aria-hidden />
              </h2>
              <Panel className="divide-y divide-ink-700/60 px-3 sm:px-4 py-1.5">
                {items.map((a) => (
                  <ActivityLine key={a.id} row={a} onOpen={openDoc} />
                ))}
              </Panel>
            </section>
          ))}
        </div>
      )}
      <p className="mt-8 text-[11px] text-mist-600 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5">
          <MessageCircleHeart className="w-3.5 h-3.5 text-gold-600" />
          Companion calls are metered separately in Analytics
        </span>
        <span className="flex items-center gap-1.5">
          <ScrollText className="w-3.5 h-3.5 text-ouro-500" />
          study sets are cached
        </span>
        <span className="flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-ankaa-500" />
          drafts live at the writing desk.
        </span>
      </p>
    </div>
  );
}
