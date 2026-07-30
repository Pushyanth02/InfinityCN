import {
  Upload,
  BookOpen,
  Sparkles,
  Film,
  Bookmark,
  MessageSquareQuote,
  PenLine,
  Rocket,
  Globe2,
  Baby,
  Users,
  HelpCircle,
  Palette,
  ListChecks,
  SpellCheck2,
  Brain,
  Lightbulb,
  Tags,
  Activity,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared activity-type metadata — the single source of truth for how every
 * activity type is displayed across the dashboard, analytics, and history
 * views. Replaces the three drifted copies that showed raw "ai_*" strings.
 *
 * Each entry: { label (human-readable), color (CSS), icon (lucide) }.
 */
export interface ActivityMeta {
  label: string;
  color: string;
  icon: LucideIcon;
}

export const ACTIVITY_META: Record<string, ActivityMeta> = {
  // Core
  upload: { label: "Imported", color: "#f0c674", icon: Upload },
  read: { label: "Read", color: "#a78bfa", icon: BookOpen },
  bookmark: { label: "Bookmarked", color: "#60a5fa", icon: Bookmark },

  // Luma (Normal Chatbot) + legacy tools
  ai_summarize: { label: "Summarized", color: "#a78bfa", icon: Sparkles },
  ai_cinematize: { label: "Cinematized", color: "#f0c674", icon: Film },
  ai_qa: { label: "Asked a question", color: "#f472b6", icon: MessageSquareQuote },
  ai_luma_chat: { label: "Chatted with Luma", color: "#a78bfa", icon: MessageSquareQuote },
  ai_continue: { label: "Continued the story", color: "#a78bfa", icon: PenLine },
  ai_ending: { label: "Reimagined an ending", color: "#f472b6", icon: Rocket },
  ai_world: { label: "Expanded the world", color: "#60a5fa", icon: Globe2 },
  ai_kids: { label: "Retold for kids", color: "#fbbf24", icon: Baby },
  ai_characters_intro: { label: "Met the characters", color: "#34d399", icon: Users },
  ai_whatif: { label: "Invented what-ifs", color: "#f472b6", icon: HelpCircle },
  ai_imagine: { label: "Imagined pictures", color: "#fbbf24", icon: Palette },
  ai_themes: { label: "Analyzed themes", color: "#a78bfa", icon: Tags },

  // Ouro (Study Buddy)
  ai_ouro_chat: { label: "Studied with Ouro", color: "#5eead4", icon: MessageSquareQuote },
  ai_ouro_guide: { label: "Built a study guide", color: "#5eead4", icon: ListChecks },
  ai_ouro_quiz: { label: "Generated a quiz", color: "#5eead4", icon: Brain },
  ai_ouro_flash: { label: "Made flashcards", color: "#5eead4", icon: ListChecks },
  ai_study: { label: "Built a study guide", color: "#5eead4", icon: ListChecks },
  ai_vocab: { label: "Listed vocabulary", color: "#5eead4", icon: SpellCheck2 },
  ai_quiz: { label: "Generated a quiz", color: "#5eead4", icon: Brain },
  ai_explain: { label: "Explained simply", color: "#5eead4", icon: Lightbulb },

  // Ankaa (Agent)
  ai_ankaa_complete: { label: "Ankaa finished a story", color: "#fb7185", icon: Rocket },

  // Background analysis job
  ai_analysis_complete: { label: "Deep analysis complete", color: "#a78bfa", icon: Sparkles },
};

const FALLBACK: ActivityMeta = {
  label: "Activity",
  color: "var(--noir-ink-mute)",
  icon: Activity,
};

/** Look up activity metadata by raw type string. Always returns a value. */
export function activityMeta(type: string): ActivityMeta {
  return ACTIVITY_META[type] ?? FALLBACK;
}
