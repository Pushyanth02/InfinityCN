"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Accessibility as AccessibilityIcon,
  AlertTriangle,
  CalendarDays,
  FileText,
  HardDrive,
  Info,
  Loader2,
  Palette,
  Shield,
  Sparkles,
  Sun,
  Moon,
  BookOpen,
  Type,
  Trash2,
  BookMarked,
  RotateCcw,
  ExternalLink,
  BookHeart,
  Baby,
  GraduationCap,
} from "lucide-react";

import { AppHeader } from "@/components/nav/app-header";
import { useNav } from "@/lib/nav-store";
import { useReaderSettings } from "@/hooks/use-reader-settings";
import {
  deleteDocument,
  patchDocument,
  useDocuments,
} from "@/hooks/use-api";
import { formatBytes, type ReaderSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LemniscateMark } from "@/components/ui/brand-loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/* ------------------------------------------------------------------ */
/* Section config                                                      */
/* ------------------------------------------------------------------ */

type SectionId =
  | "appearance"
  | "typography"
  | "accessibility"
  | "ai"
  | "storage"
  | "about";

const SECTIONS: { id: SectionId; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "typography", label: "Typography", icon: Type },
  { id: "accessibility", label: "Accessibility", icon: AccessibilityIcon },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "about", label: "About", icon: Info },
];

const ACCENT_SWATCHES: { value: string; label: string }[] = [
  { value: "#c9a84c", label: "Gold" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#e11d48", label: "Rose" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#64748b", label: "Slate" },
];

const THEMES: {
  value: ReaderSettings["theme"];
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "sepia", label: "Sepia", icon: BookOpen },
];

// Reader font families — managed exclusively in the Reader settings sheet.
// The Settings → Typography section only controls font SIZE, line height,
// letter spacing, and reading width. The font-family selection lives in
// the reader so it's contextual to the content being read.
const FONT_FAMILIES: {
  value: ReaderSettings["fontFamily"];
  label: string;
  fontClass: string;
}[] = [
  { value: "open-sans", label: "Open Sans", fontClass: "var(--font-open-sans)" },
  { value: "literata", label: "Literata", fontClass: "var(--font-literata)" },
  { value: "georgia", label: "Georgia", fontClass: "var(--font-georgia)" },
  { value: "verdana", label: "Verdana", fontClass: "var(--font-verdana)" },
  { value: "bookerly", label: "Bookerly", fontClass: "var(--font-bookerly)" },
  { value: "garamond", label: "Garamond", fontClass: "var(--font-garamond)" },
];

const CONTRAST_OPTS: { value: ReaderSettings["contrast"]; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const MOTION_OPTS: { value: ReaderSettings["motion"]; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "reduced", label: "Reduced" },
];

const ANIM_OPTS: { value: ReaderSettings["animSpeed"]; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
  { value: "slow", label: "Slow" },
];

const AI_FEATURES: {
  icon: typeof Sparkles;
  title: string;
  body: string;
}[] = [
  {
    icon: BookHeart,
    title: "Story Lover",
    body: "For novel readers — summarize and analyze, then continue the story, reimagine the ending, and expand the world.",
  },
  {
    icon: Baby,
    title: "Story Time",
    body: "For children — cozy retellings, friendly character intros, playful what-ifs, and vivid scenes to draw.",
  },
  {
    icon: GraduationCap,
    title: "Study Buddy",
    body: "For students — study guides, vocabulary lists, comprehension quizzes, and plain-language explanations.",
  },
];

/* ------------------------------------------------------------------ */
/* Shared layout primitives                                            */
/* ------------------------------------------------------------------ */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="noir-eyebrow">{eyebrow}</p>
      <h2 className="noir-display text-3xl text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="max-w-xl text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-sm transition",
        active
          ? "noir-btn-gold"
          : "noir-btn-ghost",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SubCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="noir-card p-5">
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export default function SettingsView() {
  const go = useNav((s) => s.go);
  const { settings, update } = useReaderSettings();
  const [section, setSection] = useState<SectionId>("appearance");

  return (
    <div className="dashboard-noir min-h-dvh">
      <AppHeader
        breadcrumbs={[
          { label: "Dashboard", onClick: () => go("dashboard") },
          { label: "Settings" },
        ]}
      />

      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <SectionHeader
          eyebrow="Preferences"
          title="Settings"
          subtitle="Tune the reading experience, manage storage, and learn about Lemniscate."
        />

        <Separator className="my-8 bg-border/60" />

        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Left section nav */}
          <nav
            aria-label="Settings sections"
            className="lem-scroll -mx-1 flex gap-1 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:mx-0 lg:h-fit lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-ring inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition lg:w-full",
                    active
                      ? "noir-card border border-[var(--noir-border)] font-medium text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4",
                      active && "text-[var(--noir-gold)]",
                    )}
                  />
                  <span className="whitespace-nowrap">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right content */}
          <div className="min-w-0 space-y-6">
            {section === "appearance" && (
              <AppearanceSection settings={settings} update={update} />
            )}
            {section === "typography" && (
              <TypographySection settings={settings} update={update} />
            )}
            {section === "accessibility" && (
              <AccessibilitySection settings={settings} update={update} />
            )}
            {section === "ai" && <AiSection />}
            {section === "storage" && <StorageSection />}
            {section === "about" && <AboutSection />}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Appearance                                                       */
/* ------------------------------------------------------------------ */

function AppearanceSection({
  settings,
  update,
}: {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
}) {
  return (
    <>
      <SubCard
        title="Theme"
        description="Choose the surface tone for the reading room and dashboard."
      >
        <SettingRow label="Color theme" hint="Light, dark, or warm sepia.">
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => {
              const Icon = t.icon;
              const active = settings.theme === t.value;
              return (
                <OptionButton
                  key={t.value}
                  active={active}
                  onClick={() => update({ theme: t.value })}
                  aria-label={`${t.label} theme`}
                >
                  <Icon className="size-4" />
                  {t.label}
                </OptionButton>
              );
            })}
          </div>
        </SettingRow>
      </SubCard>

      <SubCard
        title="Accent color"
        description="The single hue used for highlights, chips, and progress bars throughout the app."
      >
        <SettingRow
          label="Accent"
          hint="Gold is the Lemniscate default."
        >
          <div
            role="radiogroup"
            aria-label="Accent color"
            className="flex flex-wrap gap-2"
          >
            {ACCENT_SWATCHES.map((sw) => {
              const active = settings.accent.toLowerCase() === sw.value.toLowerCase();
              return (
                <button
                  key={sw.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={sw.label}
                  title={sw.label}
                  onClick={() => update({ accent: sw.value })}
                  className={cn(
                    "focus-ring relative size-9 rounded-full border transition",
                    active
                      ? "border-foreground/80 ring-2 ring-foreground/30"
                      : "border-border hover:scale-105",
                  )}
                  style={{ background: sw.value }}
                >
                  {active ? (
                    <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-black/70" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </SettingRow>
      </SubCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Typography                                                       */
/* ------------------------------------------------------------------ */

function TypographySection({
  settings,
  update,
}: {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
}) {
  const previewFontFamily =
    FONT_FAMILIES.find((f) => f.value === settings.fontFamily)?.fontClass ??
    "var(--font-literata)";

  return (
    <>
      <SubCard
        title="Reading typography"
        description="Size, spacing, and measure for long-form reading. Font family is selectable in the Reader settings sheet."
      >
        <SliderRow
          label="Font size"
          value={settings.fontSize}
          display={`${settings.fontSize}px`}
          min={14}
          max={28}
          onChange={(v) => update({ fontSize: v })}
        />
        <SliderRow
          label="Line height"
          value={settings.lineHeight}
          display={settings.lineHeight.toFixed(1)}
          min={1.3}
          max={2.0}
          step={0.1}
          onChange={(v) => update({ lineHeight: v })}
        />
        <SliderRow
          label="Letter spacing"
          value={settings.letterSpacing}
          display={`${settings.letterSpacing.toFixed(2)}em`}
          min={-0.02}
          max={0.05}
          step={0.01}
          onChange={(v) => update({ letterSpacing: v })}
        />
        <SliderRow
          label="Reading width"
          value={settings.readingWidth}
          display={`${settings.readingWidth}ch`}
          min={50}
          max={90}
          onChange={(v) => update({ readingWidth: v })}
        />
      </SubCard>

      <div className="noir-card p-4">
        <p className="noir-eyebrow mb-3">Preview</p>
        <p
          className="text-foreground"
          style={{
            fontFamily: previewFontFamily,
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            letterSpacing: `${settings.letterSpacing}em`,
            maxWidth: `${settings.readingWidth}ch`,
          }}
        >
          The room was quiet, save for the soft turn of a single page. Outside,
          a low wind moved through the garden — bending the grasses, lifting the
          scent of rain. She read on, half-aware of the world, half-lost inside
          the prose, until the words themselves seemed to lift from the paper and
          hang, briefly, in the still air.
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Accessibility                                                    */
/* ------------------------------------------------------------------ */

function AccessibilitySection({
  settings,
  update,
}: {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
}) {
  const [focusRing, setFocusRing] = useState<"subtle" | "strong">("subtle");

  // Sync the local focus-ring data attribute onto <html> so the global rule
  // from globals.css can pick it up. We mirror the same pattern that
  // useReaderSettings uses for contrast/motion/anim.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.focusRing = focusRing;
  }, [focusRing]);

  return (
    <>
      <SubCard
        title="Contrast & motion"
        description="Tune visibility of text and the strength of UI animation."
      >
        <SettingRow
          label="Contrast"
          hint="High contrast boosts text legibility against backgrounds."
        >
          <div className="flex gap-2">
            {CONTRAST_OPTS.map((o) => (
              <OptionButton
                key={o.value}
                active={settings.contrast === o.value}
                onClick={() => update({ contrast: o.value })}
              >
                {o.label}
              </OptionButton>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Motion"
          hint="Reduced motion disables decorative animation."
        >
          <div className="flex gap-2">
            {MOTION_OPTS.map((o) => (
              <OptionButton
                key={o.value}
                active={settings.motion === o.value}
                onClick={() => update({ motion: o.value })}
              >
                {o.label}
              </OptionButton>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Animation speed"
          hint="Off disables transitions entirely; Fast / Slow scale durations."
        >
          <div className="flex flex-wrap gap-2">
            {ANIM_OPTS.map((o) => (
              <OptionButton
                key={o.value}
                active={settings.animSpeed === o.value}
                onClick={() => update({ animSpeed: o.value })}
              >
                {o.label}
              </OptionButton>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Focus ring strength"
          hint="Make focus outlines more prominent for keyboard navigation."
        >
          <div className="flex gap-2">
            {(["subtle", "strong"] as const).map((v) => (
              <OptionButton
                key={v}
                active={focusRing === v}
                onClick={() => setFocusRing(v)}
              >
                {v === "subtle" ? "Subtle" : "Strong"}
              </OptionButton>
            ))}
          </div>
        </SettingRow>
      </SubCard>

      <SubCard
        title="Keyboard"
        description="Show in-context hints for the keyboard shortcuts available across the app."
      >
        <SettingRow
          label="Keyboard hints"
          hint="Reveal ⌘K, arrows, F, Esc labels where relevant."
        >
          <Switch
            checked={settings.kbdHints}
            onCheckedChange={(v) => update({ kbdHints: v })}
            aria-label="Toggle keyboard hints"
          />
        </SettingRow>
      </SubCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 4. AI                                                               */
/* ------------------------------------------------------------------ */

function AiSection() {
  return (
    <>
      <div className="noir-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--noir-gold)]" />
              <h3 className="text-sm font-semibold text-foreground">
                Built-in AI engine
              </h3>
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              Lemniscate&apos;s AI companion runs on the built-in Z.ai model,
              server-side, with no API key required. It adapts to three kinds
              of reader: <strong>Story Lover</strong> for novel readers,{" "}
              <strong>Story Time</strong> for children, and{" "}
              <strong>Study Buddy</strong> for students. Open any document in
              the reader and switch modes at the top of the AI panel.
            </p>
          </div>
          <Button
            type="button"
            className="noir-btn-gold shrink-0"
            onClick={() => toast.success("AI engine is ready.")}
          >
            <Sparkles className="size-4" />
            Test AI
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {AI_FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="noir-card p-5">
              <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg border border-[var(--noir-border)] bg-white/[0.03]">
                <Icon className="size-4 text-[var(--noir-gold)]" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">
                {f.title}
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Storage                                                          */
/* ------------------------------------------------------------------ */

function StorageSection() {
  const { docs, loading, setDocs, refresh } = useDocuments();
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const stats = useMemo(() => {
    const total = docs.length;
    const bytes = docs.reduce((sum, d) => sum + (d.byteSize || 0), 0);
    const avg = total > 0 ? bytes / total : 0;
    return { total, bytes, avg };
  }, [docs]);

  async function handleClearProgress() {
    if (docs.length === 0) {
      toast.info("Nothing to clear — your library is empty.");
      return;
    }
    setClearing(true);
    try {
      await Promise.all(
        docs.map((d) =>
          patchDocument(d.id, {
            readingProgress: 0,
            lastChunkIndex: 0,
            lastReadAt: null,
          }),
        ),
      );
      setDocs((prev) =>
        prev.map((d) => ({
          ...d,
          readingProgress: 0,
          lastChunkIndex: 0,
          lastReadAt: null,
        })),
      );
      toast.success(`Reading progress cleared for ${docs.length} document${docs.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error("Could not clear reading progress.", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteAll() {
    if (docs.length === 0) {
      toast.info("Your library is already empty.");
      return;
    }
    setDeleting(true);
    try {
      await Promise.all(docs.map((d) => deleteDocument(d.id)));
      setDocs([]);
      toast.success(`Deleted ${docs.length} document${docs.length === 1 ? "" : "s"}.`);
      void refresh();
    } catch (e) {
      toast.error("Could not delete all documents.", {
        description: e instanceof Error ? e.message : undefined,
      });
      void refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="noir-card p-5">
        <p className="noir-eyebrow mb-3">Library</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCell
            label="Total documents"
            value={loading ? "—" : String(stats.total)}
          />
          <StatCell
            label="Storage used"
            value={loading ? "—" : formatBytes(stats.bytes)}
          />
          <StatCell
            label="Average per doc"
            value={loading ? "—" : formatBytes(stats.avg)}
          />
        </div>
      </div>

      <SubCard
        title="Maintenance"
        description="Reset reading state without removing documents, or wipe the library entirely."
      >
        <SettingRow
          label="Clear reading progress"
          hint="Resets last-read position, chunk index, and last-read time across all documents."
        >
          <Button
            type="button"
            variant="outline"
            className="noir-btn-ghost"
            disabled={clearing || deleting || loading || stats.total === 0}
            onClick={handleClearProgress}
          >
            {clearing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Clear progress
          </Button>
        </SettingRow>

        <SettingRow
          label="Delete all documents"
          hint="Permanently removes every document, its chapters, AI scenes, and activity events."
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                disabled={clearing || deleting || loading || stats.total === 0}
              >
                <Trash2 className="size-4" />
                {deleting ? "Deleting…" : "Delete all"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-red-400" />
                  Delete all documents?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes all {stats.total} document
                  {stats.total === 1 ? "" : "s"} from your library. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAll}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingRow>
      </SubCard>
    </>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/60 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="noir-display text-2xl text-foreground">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. About                                                            */
/* ------------------------------------------------------------------ */

function AboutSection() {
  const go = useNav((s) => s.go);
  return (
    <div className="noir-card p-6 sm:p-8">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-[var(--noir-border)] bg-white/[0.03]">
          <LemniscateMark className="h-8 w-12 text-[var(--noir-gold)]" />
        </div>
        <div className="space-y-1">
          <h3 className="noir-display text-3xl text-foreground">Lemniscate</h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Version 1.0.0
          </p>
          <p className="text-sm text-[var(--noir-gold-soft)]">
            Turn any document into an interactive story.
          </p>
        </div>
      </div>

      <Separator className="my-6 bg-border/60" />

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Lemniscate is a local-first, AI-guided reading companion. Upload a PDF,
        EPUB, DOCX, Markdown, text, or HTML file; Lemniscate parses it into
        chapters, lets you read with focus mode and adaptive typography, and
        offers an AI companion with three modes — Story Lover for novel readers,
        Story Time for children, and Study Buddy for students. Continue the
        story, retell it warmly for a child, or turn it into study guides and
        quizzes.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="noir-btn-ghost"
          onClick={() => toast.info("Coming soon")}
        >
          <Shield className="size-4" />
          Privacy
        </Button>
        <Button
          type="button"
          variant="outline"
          className="noir-btn-ghost"
          onClick={() => toast.info("Coming soon")}
        >
          <FileText className="size-4" />
          Docs
        </Button>
        <Button
          type="button"
          variant="outline"
          className="noir-btn-ghost"
          onClick={() => go("library")}
        >
          <BookMarked className="size-4" />
          Open library
          <ExternalLink className="size-3.5 opacity-60" />
        </Button>
      </div>

      <div className="mt-8 flex items-center gap-3 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5" />
        <span>Built for readers · © 2025 Lemniscate.</span>
      </div>
    </div>
  );
}
