"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  LogOut,
  Mail,
  Pencil,
  Palette,
  Type,
  Shield,
  Trash2,
  User as UserIcon,
  Loader2,
} from "lucide-react";

import { AppHeader } from "@/components/nav/app-header";
import { useNav } from "@/lib/nav-store";
import { useReaderSettings } from "@/hooks/use-reader-settings";
import {
  deleteDocument,
  useDocuments,
} from "@/hooks/use-api";
import { type ReaderSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
/* Avatars                                                             */
/* ------------------------------------------------------------------ */

interface AvatarOption {
  id: string;
  initial: string;
  bg: string;
  fg: string;
  label: string;
}

const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "gold", initial: "R", bg: "#c9a84c", fg: "#1a1a1a", label: "Gold" },
  { id: "rose", initial: "A", bg: "#e11d48", fg: "#fff5f5", label: "Rose" },
  { id: "emerald", initial: "L", bg: "#10b981", fg: "#0a1f17", label: "Emerald" },
  { id: "violet", initial: "S", bg: "#8b5cf6", fg: "#1a1226", label: "Violet" },
  { id: "slate", initial: "M", bg: "#64748b", fg: "#f8fafc", label: "Slate" },
  { id: "amber", initial: "J", bg: "#f59e0b", fg: "#221801", label: "Amber" },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function memberSinceLabel(d = new Date()): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function themeLabel(t: ReaderSettings["theme"]): string {
  return t === "light" ? "Light" : t === "dark" ? "Dark" : "Sepia";
}

function fontLabel(f: ReaderSettings["fontFamily"]): string {
  return f === "sans" ? "Sans" : f === "serif" ? "Serif" : "Mono";
}

function accentLabel(accent: string): string {
  const found = AVATAR_OPTIONS.find(
    (a) => a.bg.toLowerCase() === accent.toLowerCase(),
  );
  if (found) return found.label;
  if (accent.toLowerCase() === "#6366f1") return "Indigo";
  return "Custom";
}

/* ------------------------------------------------------------------ */
/* Sub-views                                                           */
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

function ProfileCard({
  displayName,
  email,
  avatar,
}: {
  displayName: string;
  email: string;
  avatar: AvatarOption;
}) {
  const [name, setName] = useState(displayName);
  const [editing, setEditing] = useState(false);

  return (
    <section className="noir-card p-6 sm:p-8">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div
          className="flex size-20 shrink-0 items-center justify-center rounded-full text-2xl font-semibold shadow-lg"
          style={{
            background: avatar.bg,
            color: avatar.fg,
            boxShadow: `0 12px 30px -10px ${avatar.bg}80`,
          }}
          aria-hidden
        >
          {avatar.initial}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="noir-eyebrow">Local guest profile</p>
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 w-full max-w-xs bg-white/[0.04]"
                  aria-label="Display name"
                  maxLength={40}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setEditing(false);
                      toast.success("Profile saved (local)");
                    } else if (e.key === "Escape") {
                      setName(displayName);
                      setEditing(false);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="noir-btn-gold"
                  onClick={() => {
                    setEditing(false);
                    toast.success("Profile saved (local)");
                  }}
                >
                  <Check className="size-3.5" />
                  Save
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="noir-display text-3xl text-foreground">
                  {name || "Reader"}
                </h3>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  aria-label="Edit display name"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {email}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              Member since {memberSinceLabel()}
            </span>
          </div>
        </div>

        {!editing ? (
          <Button
            type="button"
            className="noir-btn-gold shrink-0"
            onClick={() => {
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
            Edit profile
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function AvatarPicker({
  current,
  onSelect,
}: {
  current: AvatarOption;
  onSelect: (a: AvatarOption) => void;
}) {
  return (
    <section className="noir-card p-6">
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Avatar</h3>
        <p className="text-xs text-muted-foreground">
          Pick a color and initial for your local profile.
        </p>
      </div>
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Avatar picker">
        {AVATAR_OPTIONS.map((a) => {
          const active = a.id === current.id;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${a.label} avatar with initial ${a.initial}`}
              title={a.label}
              onClick={() => {
                onSelect(a);
                toast.success(`Avatar updated to ${a.label}.`);
              }}
              className={cn(
                "focus-ring relative flex size-12 items-center justify-center rounded-full text-lg font-semibold transition",
                active
                  ? "ring-2 ring-foreground/60 ring-offset-2 ring-offset-[#0d0d0d]"
                  : "hover:scale-105",
              )}
              style={{ background: a.bg, color: a.fg }}
            >
              {a.initial}
              {active ? (
                <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="size-3" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PrefsQuickAccess({
  settings,
}: {
  settings: ReaderSettings;
}) {
  const go = useNav((s) => s.go);
  return (
    <section className="noir-card noir-card-hover p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <p className="noir-eyebrow">Quick access</p>
          <h3 className="text-sm font-semibold text-foreground">
            Reading preferences
          </h3>
          <p className="text-xs text-muted-foreground">
            Open settings to fine-tune typography, theme, and accessibility.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="noir-btn-ghost shrink-0"
          onClick={() => go("settings")}
        >
          Open settings
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Separator className="my-5 bg-border/60" />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <PrefSummary
          icon={Palette}
          label="Theme"
          value={themeLabel(settings.theme)}
        />
        <PrefSummary
          icon={Palette}
          label="Accent"
          value={accentLabel(settings.accent)}
          swatch={settings.accent}
        />
        <PrefSummary
          icon={Type}
          label="Font"
          value={fontLabel(settings.fontFamily)}
        />
      </dl>
    </section>
  );
}

function PrefSummary({
  icon: Icon,
  label,
  value,
  swatch,
}: {
  icon: typeof Palette;
  label: string;
  value: string;
  swatch?: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className="flex items-center gap-2 text-sm font-medium text-foreground">
        {swatch ? (
          <span
            className="inline-block size-3 rounded-full border border-border"
            style={{ background: swatch }}
            aria-hidden
          />
        ) : null}
        {value}
      </dd>
    </div>
  );
}

function DangerZone() {
  const reset = useNav((s) => s.reset);
  const { docs, loading, refresh } = useDocuments();
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAll() {
    if (docs.length === 0) {
      toast.info("Your library is already empty.");
      return;
    }
    setDeleting(true);
    try {
      await Promise.all(docs.map((d) => deleteDocument(d.id)));
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
    <section className="noir-card border-red-500/30 p-6">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="size-4 text-red-400" />
        <h3 className="text-sm font-semibold text-foreground">Danger zone</h3>
      </div>

      <div className="divide-y divide-border/60">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Sign out</p>
            <p className="text-xs text-muted-foreground">
              Return to the landing page. Your library and preferences stay on
              this device.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="noir-btn-ghost shrink-0"
            onClick={() => reset()}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>

        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Delete all data
            </p>
            <p className="text-xs text-muted-foreground">
              Permanently remove every document from your library. This cannot
              be undone.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                className="shrink-0 border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                disabled={deleting || loading || docs.length === 0}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {deleting ? "Deleting…" : "Delete all data"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-red-400" />
                  Delete all data?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes all {docs.length} document
                  {docs.length === 1 ? "" : "s"} from your library. This action
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
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export default function AccountView() {
  const go = useNav((s) => s.go);
  const { settings } = useReaderSettings();
  const [avatar, setAvatar] = useState<AvatarOption>(AVATAR_OPTIONS[0]);

  const initialName = useMemo(() => "Reader", []);
  const email = "reader@local.lemniscate";

  return (
    <div className="dashboard-noir min-h-dvh">
      <AppHeader
        breadcrumbs={[
          { label: "Dashboard", onClick: () => go("dashboard") },
          { label: "Account" },
        ]}
      />

      <main
        id="main-content"
        className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <SectionHeader
          eyebrow="Profile"
          title="Account"
          subtitle="You're reading as a local guest. Profile changes are stored on this device only."
        />

        <Separator className="my-8 bg-border/60" />

        <div className="space-y-6">
          <ProfileCard
            displayName={initialName}
            email={email}
            avatar={avatar}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <AvatarPicker current={avatar} onSelect={setAvatar} />
            <PrefsQuickAccess settings={settings} />
          </div>

          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <UserIcon className="size-3.5" />
            <span>
              Local guest · {email} · changes are not synced across devices.
            </span>
          </div>

          <Separator className="bg-border/60" />

          <DangerZone />
        </div>

        <footer className="mt-10 flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Shield className="size-3.5" />
            Local-first — your reading stays on this device.
          </span>
          <span>© 2025 Lemniscate.</span>
        </footer>
      </main>
    </div>
  );
}
