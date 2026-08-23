import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Download,
  Trash2,
  RotateCcw,
  BookOpen,
  CheckCircle2,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Wand2,
  Shuffle,
  UserCircle2,
  Palette,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  LogOut,
} from "lucide-react";
import { useNav, usePrefs, useShallow, toast } from "../lib/store";
import { clearAllData, exportAllData } from "../lib/data";
import {
  aiConfigured,
  fetchModels,
  rateInfo,
  activeModelFor,
  autoAssignFreeModels,
  ROUTER_PRESETS,
  testConnection,
  setSessionKey,
  clearSessionKey,
  getKeyMasked,
  validateKey,
} from "../lib/ai";
import { getUserIdentity, UID_KEY, UID_CREATED_KEY } from "../lib/db";
import type { AiModelInfo, BotId, ReaderFontId } from "../lib/types";
import { download, cx, timeAgo } from "../lib/utils";
import {
  Button,
  Panel,
  Input,
  Select,
  Slider,
  Toggle,
  Dialog,
  Badge,
  Eyebrow,
} from "../components/ui";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserCircle2 },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "typography", label: "Typography", icon: BookOpen },
  { id: "access", label: "Accessibility", icon: Shield },
  { id: "ai", label: "AI companions", icon: Cpu },
  { id: "storage", label: "Import & data", icon: Download },
  { id: "about", label: "About", icon: BookOpen },
];

const APP_ACCENTS = [
  { id: "gold", color: "#d2a84e", label: "Gold" },
  { id: "ouro", color: "#6d84e8", label: "Indigo" },
  { id: "ankaa", color: "#d97e4a", label: "Ember" },
  { id: "ok", color: "#63b478", label: "Moss" },
];

const MONOGRAM_COLORS = ["#d2a84e", "#6d84e8", "#d97e4a", "#63b478", "#c4c7d4"];

const FONT_OPTIONS: { value: ReaderFontId; label: string }[] = [
  { value: "literata", label: "Literata" },
  { value: "garamond", label: "EB Garamond" },
  { value: "spectral", label: "Spectral" },
  { value: "sourceserif", label: "Source Serif" },
  { value: "georgia", label: "Georgia" },
  { value: "bookerly", label: "Bookerly / Charter" },
  { value: "baskerville", label: "Baskerville" },
  { value: "palatino", label: "Palatino" },
];

export default function Settings() {
  const nav = useNav(
    useShallow((s) => ({ go: s.go, sub: s.sub, view: s.view })),
  );
  const { prefs, setPrefs, setReader, resetPrefs } = usePrefs(
    useShallow((s) => ({
      prefs: s.prefs,
      setPrefs: s.setPrefs,
      setReader: s.setReader,
      resetPrefs: s.resetPrefs,
    })),
  );
  const rs = prefs.reader;
  // "account" was folded into Settings as the Profile section — deep links keep working.
  const wanted = nav.view === "account" ? "profile" : nav.sub;
  const section = SECTIONS.some((s) => s.id === wanted)
    ? (wanted as string)
    : "profile";
  const [clearOpen, setClearOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  // Refresh `aiConfigured()` reactively — since the key lives in module-level
  // memory (not in the prefs store), we toggle this counter on save / clear
  // so the panel re-reads the live state on the next render.
  const [keyTick, setKeyTick] = useState(0);
  void keyTick;

  const connected = aiConfigured();

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await testConnection();
      toast(res.ok ? "success" : "error", res.message);
    } finally {
      setTesting(false);
    }
  };

  const commitKey = async () => {
    const k = keyInput.trim();
    if (!k) {
      toast("error", "Paste your OpenRouter key first.");
      return;
    }
    setTesting(true);
    try {
      const res = await validateKey(k);
      if (!res.ok) {
        toast("error", res.message);
        return;
      }
      setSessionKey(k);
      setKeyInput("");
      setShowKey(false);
      setKeyTick((n) => n + 1);
      toast("success", "OpenRouter key set for this session.");
    } finally {
      setTesting(false);
    }
  };

  const forgetKey = () => {
    clearSessionKey();
    setKeyInput("");
    setKeyTick((n) => n + 1);
    toast("info", "OpenRouter key cleared from memory.");
  };

  const autoAssign = async () => {
    setAssigning(true);
    try {
      const res = await autoAssignFreeModels();
      if (!res) {
        toast(
          "error",
          "No free models were visible — set your OpenRouter key, then retry.",
        );
        return;
      }
      setPrefs({ aiModels: { ...prefs.aiModels, ...res } });
      toast(
        "success",
        `Router assigned — Luma: ${res.luma.split("/").pop()} · Ouro: ${res.ouro.split("/").pop()} · Ankaa: ${res.ankaa.split("/").pop()}`,
      );
    } catch (e) {
      toast(
        "error",
        e instanceof Error ? e.message : "Couldn't reach the model catalog.",
      );
    } finally {
      setAssigning(false);
    }
  };
  const [clearing, setClearing] = useState(false);

  const activeSectionMeta = SECTIONS.find((s) => s.id === section);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16">
      <Eyebrow className="mb-3">Your room, your rules</Eyebrow>
      <h1 className="font-display font-semibold text-3xl sm:text-4xl text-mist-100 tracking-tight mb-2">
        Settings &amp; profile
      </h1>
      <p className="text-sm text-mist-500 mb-8 sm:mb-10 max-w-xl">
        Tune the room to your hand — typography, motion, AI companions and your
        local identity.
      </p>

      <div className="grid lg:grid-cols-[240px_1fr] gap-6 lg:gap-10 items-start">
        {/* ───────── Section navigation ───────── */}
        <nav
          className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-20 -mx-4 px-4 lg:mx-0 lg:px-0"
          aria-label="Settings sections"
          style={{ scrollbarWidth: "none" }}
        >
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => nav.go("settings", { sub: s.id })}
                aria-current={active ? "true" : undefined}
                className={cx(
                  "group flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-sm font-display whitespace-nowrap transition-all border shrink-0 lg:w-full",
                  active
                    ? "bg-gold-500/10 text-gold-300 border-gold-700/50 shadow-[0_0_0_3px_var(--acc-soft)]"
                    : "text-mist-400 hover:text-mist-100 hover:bg-ink-750/60 border-transparent",
                )}
              >
                <s.icon
                  className={cx(
                    "w-4 h-4 shrink-0 transition-colors",
                    active
                      ? "text-gold-400"
                      : "text-mist-500 group-hover:text-mist-300",
                  )}
                />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* ───────── Section content ───────── */}
        <div className="space-y-5 min-w-0">
          {/* section header on mobile only */}
          <div className="lg:hidden flex items-center gap-2 text-[11px] font-display uppercase tracking-[0.2em] text-mist-500">
            {activeSectionMeta && (
              <activeSectionMeta.icon className="w-3.5 h-3.5" />
            )}
            {activeSectionMeta?.label}
          </div>

          {section === "profile" && (
            <>
              <Panel className="p-5 sm:p-6">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <UserCircle2 className="w-4 h-4 text-gold-400" />
                  <h2 className="font-display text-mist-100">
                    How the room addresses you
                  </h2>
                </div>
                <p className="text-xs text-mist-500 mb-5 leading-relaxed">
                  A name and a mark — used in the dashboard greeting and on your
                  monogram. Stored only on this device.
                </p>
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  <div className="flex flex-col items-center gap-3 shrink-0">
                    <div
                      aria-hidden
                      className="w-20 h-20 rounded-2xl flex items-center justify-center font-garamond italic text-3xl text-ink-950 shadow-glow-gold transition-all hover:scale-105"
                      style={{ background: prefs.profile.color }}
                    >
                      {(prefs.profile.name.trim()[0] ?? "∞").toUpperCase()}
                    </div>
                    <span className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-600">
                      monogram
                    </span>
                  </div>
                  <div className="flex-1 space-y-4 w-full">
                    <Input
                      label="Display name"
                      placeholder="e.g. Ada"
                      value={prefs.profile.name}
                      maxLength={24}
                      onChange={(e) =>
                        setPrefs({
                          profile: { ...prefs.profile, name: e.target.value },
                        })
                      }
                    />
                    <div>
                      <span className="block text-xs font-display uppercase tracking-widest text-mist-500 mb-2">
                        Monogram color
                      </span>
                      <div
                        className="flex gap-2.5 flex-wrap"
                        role="radiogroup"
                        aria-label="Monogram color"
                      >
                        {MONOGRAM_COLORS.map((c) => (
                          <button
                            key={c}
                            role="radio"
                            aria-checked={prefs.profile.color === c}
                            aria-label={`Monogram color ${c}`}
                            onClick={() =>
                              setPrefs({
                                profile: { ...prefs.profile, color: c },
                              })
                            }
                            className={cx(
                              "w-9 h-9 rounded-full border-2 transition-transform press",
                              prefs.profile.color === c
                                ? "border-mist-100 scale-110 shadow-[0_0_12px_var(--acc-glow)]"
                                : "border-transparent hover:scale-105",
                            )}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel className="p-5 sm:p-6">
                <h2 className="font-display text-mist-100 mb-1.5">
                  Local session
                </h2>
                <p className="text-xs text-mist-500 mb-4 leading-relaxed">
                  Lemniscate is local-first: there is no server account. Every
                  record is stamped with this anonymous identity, so nothing can
                  be reached from another browser profile.
                </p>
                <div className="rounded-lg bg-ink-800 border border-ink-700 p-3">
                  <p className="text-[10px] font-display uppercase tracking-[0.16em] text-mist-600 mb-1.5">
                    Session id
                  </p>
                  <p className="text-[11px] font-mono text-mist-300 break-all leading-relaxed">
                    {getUserIdentity().id}
                  </p>
                </div>
                <p className="text-[11px] text-mist-600 mt-2.5">
                  Session created {timeAgo(getUserIdentity().createdAt)}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      download(
                        `lemniscate-export-${new Date().toISOString().slice(0, 10)}.json`,
                        await exportAllData(),
                      );
                      toast("success", "Export downloaded.");
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Export everything
                  </Button>
                  <Button variant="danger" onClick={() => setRotateOpen(true)}>
                    <RefreshCw className="w-4 h-4" />
                    Rotate identity
                  </Button>
                </div>
                <p className="text-[11px] text-mist-600 mt-3 leading-relaxed">
                  Rotating starts a fresh anonymous session; existing records
                  stay in storage but become invisible to the new identity.
                </p>
              </Panel>
            </>
          )}

          {section === "appearance" && (
            <>
              <Panel className="p-5 sm:p-6">
                <h2 className="font-display text-mist-100 mb-1.5">
                  App accent
                </h2>
                <p className="text-xs text-mist-500 mb-5 leading-relaxed">
                  Used across the dashboard, library and utility views. Gold is
                  the house color.
                </p>
                <div
                  className="flex flex-wrap gap-3"
                  role="radiogroup"
                  aria-label="App accent color"
                >
                  {APP_ACCENTS.map((a) => {
                    const active = prefs.accent === a.id;
                    return (
                      <button
                        key={a.id}
                        role="radio"
                        aria-checked={active}
                        title={a.label}
                        aria-label={a.label}
                        onClick={() => {
                          setPrefs({ accent: a.id });
                          toast(
                            "success",
                            `Accent set to ${a.label.toLowerCase()}.`,
                          );
                        }}
                        className={cx(
                          "group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all press",
                          active
                            ? "border-mist-100 bg-ink-800 shadow-[0_0_0_3px_var(--acc-soft)]"
                            : "border-ink-700 hover:border-ink-600 hover:bg-ink-800/60",
                        )}
                      >
                        <span
                          className={cx(
                            "w-9 h-9 rounded-full border-2 transition-transform",
                            active
                              ? "scale-110 shadow-[0_0_12px_var(--acc-glow)]"
                              : "group-hover:scale-105",
                          )}
                          style={{
                            background: a.color,
                            borderColor: active
                              ? "var(--color-mist-100)"
                              : "transparent",
                          }}
                        />
                        <span
                          className={cx(
                            "text-[11px] font-display",
                            active ? "text-mist-100" : "text-mist-400",
                          )}
                        >
                          {a.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Panel>
              <Panel className="p-5 sm:p-6">
                <h2 className="font-display text-mist-100 mb-1.5">Theme</h2>
                <p className="text-sm text-mist-500 leading-relaxed">
                  Utility views keep the Vellum &amp; Ember treatment. The
                  reader has its own independent themes — Light, Dark and Sepia
                  — set inside the reader or under Typography defaults.
                </p>
              </Panel>
            </>
          )}

          {section === "typography" && (
            <Panel className="p-5 sm:p-6">
              <h2 className="font-display text-mist-100 mb-1.5">
                Reader defaults
              </h2>
              <p className="text-xs text-mist-500 mb-5 leading-relaxed">
                Applied the moment you open any document; adjustable per-session
                inside the reader.
              </p>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                <Select
                  label="Typeface"
                  value={rs.fontFamily}
                  onChange={(e) =>
                    setReader({ fontFamily: e.target.value as ReaderFontId })
                  }
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <div className="sm:pt-6">
                  <SegmentedTheme />
                </div>
              </div>
              <div className="mt-5 space-y-1">
                <Slider
                  label="Font size"
                  value={rs.fontSize}
                  min={14}
                  max={26}
                  step={1}
                  unit="px"
                  onChange={(v) => setReader({ fontSize: v })}
                />
                <Slider
                  label="Line height"
                  value={rs.lineHeight}
                  min={1.3}
                  max={2.2}
                  step={0.05}
                  onChange={(v) => setReader({ lineHeight: v })}
                />
                <Slider
                  label="Letter spacing"
                  value={rs.letterSpacing}
                  min={0}
                  max={25}
                  step={1}
                  unit={
                    rs.letterSpacing
                      ? ` ${(rs.letterSpacing / 100).toFixed(2)}em`
                      : ""
                  }
                  onChange={(v) => setReader({ letterSpacing: v })}
                />
                <Slider
                  label="Reading width"
                  value={rs.width}
                  min={48}
                  max={92}
                  step={1}
                  unit="ch"
                  onChange={(v) => setReader({ width: v })}
                />
              </div>
              {/* live preview */}
              <div
                className="hairline rounded-xl p-5 mt-5 relative"
                style={{
                  fontFamily: `var(--font-${rs.fontFamily})`,
                  fontSize: `${rs.fontSize * 0.82}px`,
                  lineHeight: rs.lineHeight,
                  letterSpacing: `${rs.letterSpacing / 100}em`,
                }}
              >
                <span className="absolute top-2.5 right-3 text-[9px] font-display uppercase tracking-[0.16em] text-mist-600">
                  live preview
                </span>
                <p className="text-mist-300 mb-2.5">
                  The lamp kept its post, and the threshold became what
                  thresholds are secretly for.
                </p>
                <p className="text-mist-400 opacity-80">
                  Set the room to your hand: choose a face, widen the line, slow
                  the eye.
                </p>
              </div>
            </Panel>
          )}

          {section === "access" && (
            <Panel className="p-5 sm:p-6 space-y-1.5">
              <h2 className="font-display text-mist-100 mb-4">Accessibility</h2>
              <div className="py-2">
                <span className="block text-sm text-mist-200 mb-2">
                  Reader contrast
                </span>
                <div className="flex gap-2">
                  {(["normal", "high"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setReader({ contrast: c })}
                      aria-pressed={rs.contrast === c}
                      className={cx(
                        "px-3.5 py-2 rounded-lg border text-xs font-display transition-all press",
                        rs.contrast === c
                          ? "border-gold-600 text-gold-300 bg-gold-500/10"
                          : "border-ink-600 text-mist-400 hover:border-ink-500",
                      )}
                    >
                      {c === "normal" ? "Normal" : "High"}
                    </button>
                  ))}
                </div>
              </div>
              <Toggle
                label="Reduced motion"
                hint="Disables decorative animation app-wide; functional changes stay visible."
                checked={!rs.motion}
                onChange={(v) => setReader({ motion: !v })}
              />
              {rs.motion && (
                <Slider
                  label="Animation speed"
                  value={rs.animSpeed}
                  min={0.5}
                  max={1.5}
                  step={0.1}
                  unit="×"
                  onChange={(v) => setReader({ animSpeed: v })}
                />
              )}
              <Toggle
                label="Strong focus rings"
                hint="Thicker outlines for keyboard navigation."
                checked={prefs.ring === "strong"}
                onChange={(v) => setPrefs({ ring: v ? "strong" : "normal" })}
              />
              <Toggle
                label="Keyboard hints"
                hint="Shortcut affordances inside the reader."
                checked={rs.kbdHints}
                onChange={(v) => setReader({ kbdHints: v })}
              />
            </Panel>
          )}

          {section === "ai" && (
            <>
              <Panel className="p-5 sm:p-6">
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <KeyRound className="w-4 h-4 text-gold-400" />
                  <h2 className="font-display text-mist-100">OpenRouter key</h2>
                  <Badge tone={connected ? "ok" : "muted"} className="ml-auto">
                    {connected ? "key set" : "no key"}
                  </Badge>
                </div>
                <p className="text-xs text-mist-500 leading-relaxed mb-4">
                  The browser calls OpenRouter directly — your key lives only in
                  memory for this session and is never written to localStorage,
                  IndexedDB or prefs. With a key set, Luma, Ouro and Ankaa use
                  live language models; without it, every companion still works
                  via grounded Anchor engines and every non-AI feature is
                  unchanged.
                </p>

                {/* ─── live status line ─── */}
                <div className="rounded-lg border border-ink-700 bg-ink-875 px-4 py-3 mb-4 flex items-center gap-3">
                  <span
                    className={cx(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      connected ? "bg-ok-500" : "bg-mist-600",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-mist-200 font-display leading-tight">
                      {connected
                        ? `Session key: ${getKeyMasked() || "••••"}`
                        : "No key set — companions run the Anchor engine"}
                    </p>
                    <p className="text-[11px] text-mist-500 mt-0.5 leading-relaxed">
                      {connected
                        ? "Companions answer with live models, metered daily. Reload the page to clear the key."
                        : "Paste your OpenRouter key below to enable live companions."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={testing}
                    onClick={() => void runTest()}
                    className="shrink-0"
                    disabled={!connected}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Test
                  </Button>
                </div>

                {/* ─── key entry ─── */}
                <div className="rounded-lg border border-ink-700 bg-ink-875 px-4 py-4 mb-4">
                  <label className="block text-[10px] font-display uppercase tracking-[0.16em] text-mist-500 mb-2">
                    {connected ? "Replace key" : "Paste your OpenRouter key"}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? "text" : "password"}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder="sk-or-v1•••••••••••••••"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="OpenRouter API key"
                        className="w-full rounded-lg border border-ink-600 bg-ink-850 pl-3 pr-10 py-2 text-sm text-mist-100 placeholder:text-mist-600 focus:border-gold-600 focus:shadow-[0_0_0_3px_var(--acc-soft)] outline-none transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? "Hide key" : "Show key"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-mist-500 hover:text-gold-300 transition-colors"
                      >
                        {showKey ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="gold"
                        loading={testing}
                        onClick={() => void commitKey()}
                        className="shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {connected ? "Replace" : "Save & validate"}
                      </Button>
                      {connected && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={forgetKey}
                          className="shrink-0"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-mist-600 mt-2 leading-relaxed">
                    Validate uses{" "}
                    <code className="text-mist-400 font-mono text-[10px]">
                      GET /api/v1/key
                    </code>{" "}
                    — the key is sent only to OpenRouter, never to any other
                    server.
                  </p>
                </div>

                {/* ─── setup instructions ─── */}
                <details className="mb-2 group">
                  <summary className="text-xs font-display uppercase tracking-[0.14em] text-gold-400 cursor-pointer hover:text-gold-300 transition-colors list-none flex items-center gap-1.5 select-none">
                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                    Where to get an OpenRouter key
                  </summary>
                  <ol className="mt-3 space-y-2 text-xs text-mist-400 leading-relaxed pl-4">
                    <li>
                      <span className="text-mist-600 font-display tabular-nums">
                        1.
                      </span>{" "}
                      Create or sign in to your account at{" "}
                      <a
                        href="https://openrouter.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold-400 hover:text-gold-300 underline underline-offset-2 decoration-gold-700/50"
                      >
                        openrouter.ai
                      </a>
                      .
                    </li>
                    <li>
                      <span className="text-mist-600 font-display tabular-nums">
                        2.
                      </span>{" "}
                      Open the dashboard and click{" "}
                      <span className="text-mist-300">Keys → Create Key</span>.
                    </li>
                    <li>
                      <span className="text-mist-600 font-display tabular-nums">
                        3.
                      </span>{" "}
                      Copy the key (starts with{" "}
                      <code className="text-mist-300 font-mono text-[11px]">
                        sk-or-…
                      </code>
                      ).
                    </li>
                    <li>
                      <span className="text-mist-600 font-display tabular-nums">
                        4.
                      </span>{" "}
                      Paste it above and press{" "}
                      <span className="text-mist-300">Save &amp; validate</span>
                      . Free models are filtered automatically.
                    </li>
                  </ol>
                  <p className="mt-3 text-[11px] text-mist-600 leading-relaxed flex items-start gap-1.5">
                    <Shield className="w-3 h-3 text-gold-600 shrink-0 mt-0.5" />
                    <span>
                      The key lives only in memory for this tab — reload the
                      page or close the tab to wipe it. Nothing is ever written
                      to disk.
                    </span>
                  </p>
                </details>
              </Panel>

              <Panel className="p-5 sm:p-6">
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <Cpu className="w-4 h-4 text-gold-400" />
                  <h2 className="font-display text-mist-100">Models</h2>
                  <Badge tone="muted" className="ml-auto">
                    searchable catalog
                  </Badge>
                </div>
                <p className="text-xs text-mist-500 mb-4 leading-relaxed">
                  Each companion can use any model on OpenRouter. The catalog is
                  fetched live and cached for six hours; every bot also keeps an
                  automatic fallback chain.
                </p>
                <div className="hairline rounded-xl bg-linear-to-br from-ink-875 to-ink-850 px-4 py-3.5 mb-4 flex flex-wrap items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gold-500/15 border border-gold-700/40 flex items-center justify-center shrink-0">
                    <Wand2 className="w-4 h-4 text-gold-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-mist-200 font-display">
                      Universal router
                    </p>
                    <p className="text-[11px] text-mist-500 leading-relaxed mt-0.5">
                      Fetches every free model on OpenRouter, ranks them by
                      intelligence and creativity, and assigns the best fit to
                      Luma, Ouro and Ankaa in one move.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="gold"
                    loading={assigning}
                    onClick={() => void autoAssign()}
                    className="shrink-0"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Auto-assign
                  </Button>
                </div>
                <div className="space-y-3">
                  {(["luma", "ouro", "ankaa"] as BotId[]).map((bot) => (
                    <ModelPicker key={bot} bot={bot} />
                  ))}
                </div>
              </Panel>

              <Panel className="p-5 sm:p-6">
                <h2 className="font-display text-mist-100 mb-4">
                  Pacing & quota
                </h2>
                <RateMeter />
                <div className="mt-5">
                  <Slider
                    label="Daily quota (online calls)"
                    value={prefs.dailyQuota}
                    min={20}
                    max={400}
                    step={10}
                    onChange={(v) => setPrefs({ dailyQuota: v })}
                  />
                  <p className="text-[11px] text-mist-600 mt-1.5 leading-relaxed">
                    Requests are rate-limited to 15/minute and queued rather
                    than dropped. Usage is metered in Insights → Analytics.
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-ink-700">
                  <Toggle
                    label="Refine imports with AI"
                    hint="After parsing, an AI pass re-checks chapter numbering (Arabic & Roman), paragraph breaks and dialogue. Deterministic parsing always remains the fallback."
                    checked={prefs.aiRefine}
                    onChange={(v) => setPrefs({ aiRefine: v })}
                  />
                </div>
              </Panel>
            </>
          )}

          {section === "storage" && (
            <>
              <Panel className="p-5 sm:p-6">
                <h2 className="font-display text-mist-100 mb-4">Import</h2>
                <Slider
                  label="Maximum upload size"
                  value={prefs.maxUploadMB}
                  min={5}
                  max={100}
                  step={5}
                  unit=" MB"
                  onChange={(v) => setPrefs({ maxUploadMB: v })}
                />
                <p className="text-[11px] text-mist-600 mt-1.5 leading-relaxed">
                  Files are validated by extension, MIME type and content
                  signature before parsing.
                </p>
              </Panel>
              <Panel className="p-5 sm:p-6">
                <h2 className="font-display text-mist-100 mb-1.5">
                  Local data
                </h2>
                <p className="text-xs text-mist-500 mb-5 leading-relaxed">
                  Everything — documents, bookmarks, annotations, scenes,
                  activity, usage — lives in this browser’s IndexedDB.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      download(
                        `lemniscate-export-${new Date().toISOString().slice(0, 10)}.json`,
                        await exportAllData(),
                      );
                      toast("success", "Export downloaded.");
                    }}
                    className="justify-start"
                  >
                    <Download className="w-4 h-4" />
                    <span className="text-left">
                      <span className="block">Export all data</span>
                      <span className="block text-[10px] font-body opacity-60 -mb-0.5">
                        JSON · everything you have
                      </span>
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetPrefs();
                      toast("info", "Preferences reset to defaults.");
                    }}
                    className="justify-start"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="text-left">
                      <span className="block">Reset preferences</span>
                      <span className="block text-[10px] font-body opacity-60 -mb-0.5">
                        Keep library, restore defaults
                      </span>
                    </span>
                  </Button>
                </div>
                <div className="mt-3">
                  <Button
                    variant="danger"
                    onClick={() => setClearOpen(true)}
                    className="w-full justify-start"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-left">
                      <span className="block">Clear all data</span>
                      <span className="block text-[10px] font-body opacity-70 -mb-0.5">
                        Documents, bookmarks, scenes — everything goes
                      </span>
                    </span>
                  </Button>
                </div>
              </Panel>
            </>
          )}

          {section === "about" && (
            <>
              <Panel className="p-5 sm:p-6">
                <h2 className="font-garamond italic text-2xl text-mist-100 mb-3">
                  Lemniscate — the reading room
                </h2>
                <p className="text-sm text-mist-400 leading-relaxed mb-3">
                  A local-first reading room where books, papers, documents and
                  stories become living, interactive experiences. Import once;
                  read in a calm, chapter-aware reader; converse with Luma,
                  study with Ouro, and write with Ankaa — all grounded in your
                  text.
                </p>
                <p className="text-sm text-mist-400 leading-relaxed flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
                  <span>
                    Privacy: your documents never leave this device. Parsing,
                    progress, annotations and offline AI all run locally. An
                    optional OpenRouter key talks only to openrouter.ai when you
                    choose.
                  </span>
                </p>
              </Panel>
              <Panel className="p-5 sm:p-6">
                <h2 className="font-display text-mist-100 mb-4">
                  Documentation
                </h2>
                <ul className="space-y-3.5">
                  {[
                    [
                      "Import",
                      "Drop PDF, EPUB, DOCX, Markdown, TXT or HTML onto the Import view. The engine validates content signatures, strips boilerplate, mends broken lines, detects chapters from real structure and quality-scores the result.",
                    ],
                    [
                      "Reader",
                      "Alt+←/→ changes chapters · b bookmarks · f focus mode · s scene view · t index · l Luma · / search · ? all shortcuts.",
                    ],
                    [
                      "Companions",
                      "Luma answers from the active chapter; Ouro builds cached study sets; Ankaa drafts long-form as visible jobs. Without a key, grounded Anchor engines take over.",
                    ],
                    [
                      "Data",
                      "Stored in IndexedDB under lemniscate. Export anytime from Import & storage. Deleting a document removes its bookmarks, annotations and scenes.",
                    ],
                  ].map(([t, b]) => (
                    <li key={t} className="flex gap-3">
                      <CheckCircle2 className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-display text-mist-200">
                          {t}
                        </p>
                        <p className="text-xs text-mist-500 leading-relaxed mt-1">
                          {b}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 pt-4 border-t border-ink-700 text-[11px] font-display uppercase tracking-[0.18em] text-mist-600 flex items-center gap-2 flex-wrap">
                  <BookOpen className="w-3.5 h-3.5 text-gold-600 shrink-0" />
                  <span>Lemniscate v1.0 · Vellum &amp; Ember edition</span>
                  <span className="opacity-60 normal-case tracking-normal font-body">
                    ·
                  </span>
                  <span className="opacity-70 normal-case tracking-normal font-body">
                    Space Grotesk &amp; Open Sans · reader faces: Literata,
                    Garamond, Spectral, Source Serif, Georgia, Bookerly,
                    Baskerville, Palatino
                  </span>
                </p>
              </Panel>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear everything?"
      >
        <p className="text-sm text-mist-400 leading-relaxed">
          This deletes all documents, bookmarks, annotations, scenes, stories,
          activity and usage records from this browser. Preferences stay. This
          cannot be undone.
        </p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => setClearOpen(false)}
            className="w-full sm:w-auto"
          >
            Keep my library
          </Button>
          <Button
            variant="danger"
            loading={clearing}
            onClick={async () => {
              setClearing(true);
              try {
                await clearAllData();
                setClearOpen(false);
                toast("info", "All local data cleared. The room is fresh.");
                nav.go("dashboard");
              } finally {
                setClearing(false);
              }
            }}
            className="w-full sm:w-auto"
          >
            <Trash2 className="w-4 h-4" />
            Clear all data
          </Button>
        </div>
      </Dialog>

      {/* Identity rotation confirmation — protects against accidental clicks */}
      <Dialog
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        title="Rotate your identity?"
      >
        <div className="space-y-4">
          <p className="text-sm text-mist-400 leading-relaxed">
            This starts a fresh anonymous session. Your current session ID will
            be replaced with a new one, and the page will reload. Your existing
            documents, bookmarks, annotations and stories{" "}
            <span className="text-mist-200">stay in storage</span> but become{" "}
            <span className="text-gold-300">invisible</span> to the new identity
            — as if they belong to someone else.
          </p>
          <div className="rounded-lg border border-gold-700/40 bg-gold-500/5 px-4 py-3 flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-mist-400 leading-relaxed">
              This is useful if you share this browser and want a clean
              separation. To recover the old data, you would need to rotate back
              to the previous identity (not supported — rotation is one-way).
            </p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-1">
            <Button
              variant="ghost"
              onClick={() => setRotateOpen(false)}
              className="w-full sm:w-auto"
            >
              Keep my identity
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setRotateOpen(false);
                localStorage.removeItem(UID_KEY);
                localStorage.removeItem(UID_CREATED_KEY);
                toast("info", "Identity rotated. Starting a fresh session…");
                setTimeout(() => location.reload(), 600);
              }}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Rotate &amp; reload
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function SegmentedTheme() {
  const { prefs, setReader } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setReader: s.setReader })),
  );
  return (
    <div>
      <span className="block text-xs font-display uppercase tracking-widest text-mist-500 mb-2">
        Default reader theme
      </span>
      <div className="inline-flex rounded-lg border border-ink-600 bg-ink-875 p-0.5 gap-0.5">
        {(["light", "dark", "sepia"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setReader({ theme: t })}
            aria-pressed={prefs.reader.theme === t}
            className={cx(
              "px-3.5 py-1.5 rounded-md text-xs font-display capitalize transition-all",
              prefs.reader.theme === t
                ? "bg-gold-500/15 text-gold-300 border border-gold-700/50"
                : "text-mist-400 hover:text-mist-200 border border-transparent",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- AI: rate meter ---------------- */

function RateMeter() {
  const [info, setInfo] = useState(rateInfo());
  useEffect(() => {
    const t = window.setInterval(() => setInfo(rateInfo()), 4000);
    return () => window.clearInterval(t);
  }, []);
  const pctUsed = Math.round((info.used / info.limit) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-mist-500 mb-1.5">
        <span>Rolling minute</span>
        <span className="font-display tabular-nums text-mist-300">
          {info.used}/{info.limit} calls
        </span>
      </div>
      <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
        <div
          className={cx(
            "h-full rounded-full transition-all duration-500",
            pctUsed > 80 ? "bg-danger-500" : "bg-gold-500",
          )}
          style={{ width: `${pctUsed}%` }}
        />
      </div>
      <p className="text-[11px] text-mist-600 mt-1.5 leading-relaxed">
        When the window fills, new requests queue briefly instead of failing.
      </p>
    </div>
  );
}

/* ---------------- AI: searchable model picker ---------------- */

function ModelPicker({ bot }: { bot: BotId }) {
  const { prefs, setPrefs } = usePrefs(
    useShallow((s) => ({ prefs: s.prefs, setPrefs: s.setPrefs })),
  );
  const [models, setModels] = useState<AiModelInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setErr(null);
    try {
      setModels(await fetchModels(force));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t load the catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !models && !loading) void load();
  }, [open, models, loading, load]);

  const current = prefs.aiModels[bot] ?? null;
  const filtered = (models ?? [])
    .filter((m) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return (
        m.id.toLowerCase().includes(needle) ||
        m.name.toLowerCase().includes(needle)
      );
    })
    .slice(0, 40);

  const botMeta: Record<BotId, { label: string; hint: string; tone: string }> =
    {
      luma: {
        label: "Luma · conversation",
        hint: "fast responses, medium answers",
        tone: "text-gold-400",
      },
      ouro: {
        label: "Ouro · study",
        hint: "structured academic output",
        tone: "text-ouro-400",
      },
      ankaa: {
        label: "Ankaa · long-form",
        hint: "large context + long completions help",
        tone: "text-ankaa-400",
      },
    };
  const accentTone = botMeta[bot].tone;

  return (
    <div className="hairline rounded-xl bg-ink-875 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-800/60 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              "block text-[10px] font-display uppercase tracking-[0.16em]",
              accentTone,
            )}
          >
            {botMeta[bot].label}
          </span>
          <span
            className={cx(
              "block text-sm mt-1 truncate font-mono",
              current ? "text-gold-300" : "text-mist-400",
            )}
          >
            {current
              ? ROUTER_PRESETS.find((p) => p.id === current)
                ? `${ROUTER_PRESETS.find((p) => p.id === current)!.label} · ${current}`
                : current
              : `${activeModelFor(bot)} (default)`}
          </span>
        </span>
        <ChevronDown
          className={cx(
            "w-4 h-4 text-mist-500 transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-ink-700 pt-3">
          <div className="relative mb-2.5">
            <Search className="w-3.5 h-3.5 text-mist-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${models?.length.toLocaleString() ?? ""} models…`}
              aria-label={`Search models for ${bot}`}
              className="w-full rounded-lg border border-ink-600 bg-ink-850 pl-9 pr-3 py-2 text-sm text-mist-100 placeholder:text-mist-600 focus:border-gold-600 focus:shadow-[0_0_0_3px_var(--acc-soft)] outline-none transition-all"
            />
          </div>
          {loading && (
            <p className="text-xs text-mist-500 flex items-center gap-2 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gold-400" />
              Fetching the OpenRouter catalog…
            </p>
          )}
          {err && (
            <div className="py-2">
              <p className="text-xs text-danger-400">{err}</p>
              <Button
                size="xs"
                variant="outline"
                className="mt-2"
                onClick={() => void load(true)}
              >
                Retry
              </Button>
            </div>
          )}
          {!loading && !err && (
            <>
              <ul
                className="max-h-56 overflow-y-auto space-y-1 pr-1"
                role="listbox"
                aria-label={`Models for ${bot}`}
                style={{ scrollbarWidth: "thin" }}
              >
                {current && (
                  <li>
                    <button
                      onClick={() => {
                        setPrefs({
                          aiModels: { ...prefs.aiModels, [bot]: undefined },
                        });
                        setOpen(false);
                        toast(
                          "success",
                          `${botMeta[bot].label} back on its default model.`,
                        );
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-mist-400 hover:bg-ink-750 hover:text-gold-300 transition-colors"
                    >
                      ↩ Use default ({activeModelFor(bot)})
                    </button>
                  </li>
                )}
                {ROUTER_PRESETS.map((p) => {
                  const selected = current === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setPrefs({
                            aiModels: { ...prefs.aiModels, [bot]: p.id },
                          });
                          setOpen(false);
                          toast(
                            "success",
                            `${botMeta[bot].label} now uses the ${p.label.toLowerCase()} — resolved live from the free catalog.`,
                          );
                        }}
                        className={cx(
                          "w-full text-left px-3 py-2 rounded-lg transition-all",
                          selected
                            ? "bg-gold-500/10 border border-gold-700/50"
                            : "hover:bg-ink-750 border border-transparent",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] text-mist-200">
                            {p.label}
                          </span>
                          <Badge tone="gold">router</Badge>
                          {selected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-gold-400 ml-auto shrink-0" />
                          )}
                        </span>
                        <span className="block text-[10px] text-mist-600 mt-1 leading-relaxed">
                          {p.hint} · {p.id}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filtered.map((m) => {
                  const free = m.inPerM === 0 && m.outPerM === 0;
                  const selected = current === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setPrefs({
                            aiModels: { ...prefs.aiModels, [bot]: m.id },
                          });
                          setOpen(false);
                          toast(
                            "success",
                            `${botMeta[bot].label} now uses ${m.id}.`,
                          );
                        }}
                        className={cx(
                          "w-full text-left px-3 py-2 rounded-lg transition-all",
                          selected
                            ? "bg-gold-500/10 border border-gold-700/50"
                            : "hover:bg-ink-750 border border-transparent",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] text-mist-200 truncate">
                            {m.name}
                          </span>
                          {free && <Badge tone="ok">free</Badge>}
                          {selected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-gold-400 ml-auto shrink-0" />
                          )}
                        </span>
                        <span className="block text-[10px] text-mist-600 font-mono truncate mt-1">
                          {m.id} · {(m.context / 1000).toFixed(0)}k ctx ·{" "}
                          {free
                            ? "free"
                            : `$${m.inPerM.toFixed(2)}/$${m.outPerM.toFixed(2)} per M`}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="px-3 py-3 text-xs text-mist-500">
                    No models match “{q}”.
                  </li>
                )}
              </ul>
              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                <p className="text-[10px] text-mist-600">
                  {botMeta[bot].hint} · fallback chain stays active
                </p>
                <button
                  onClick={() => void load(true)}
                  className="text-[10px] font-display text-gold-400 hover:text-gold-300 transition-colors"
                >
                  Refresh catalog
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
