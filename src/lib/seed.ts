/** First-run seed: two original sample texts so every surface is alive immediately. */
import type { DocumentRow } from "./types";
import { idbAll, idbPut, getUserId } from "./db";
import { toChapters } from "./engine";
import { coverGradient } from "./utils";
import { logActivity } from "./data";

const DUNGEONCORE: { title: string; paras: string[] }[] = [
  {
    title: "I. The Descent",
    paras: [
      "The dungeon breathed below the city like a sleeping beast, its exhale rising through cracked flagstones in the form of dust and old magic. Most who walked above never felt it — but those who descended, those who answered the call of the deep, they knew. The stone remembered every footstep, every torch, every soul that had dared to go lower.",
      "Pushyanth stood at the threshold of the ninth level, where the air turned from cold to alive. The necromancer's mark pulsed on his wrist — a spiral of bone-white light that had appeared the night the dungeon had first called to him. It was not a curse. It was an invitation.",
      "Below, the dead walked. Not as shambling corpses, but as guardians, keepers of secrets that the living world had forgotten. To command them was to understand them — their silence, their patience, their hunger for purpose. The dungeoncore was not a place of death. It was a place where death served a new master.",
    ],
  },
  {
    title: "II. The Bone Library",
    paras: [
      "The skeleton archivist tilted its skull in greeting. Pushyanth had learned their language — the click of teeth, the tilt of jaw, the rattle of ribs like a question mark. The library stretched in every direction, shelves of bone holding scrolls of vellum that glowed with faint phosphorescence.",
      "“You seek the Lich King's cipher,” the archivist rattled. Its finger-bones traced a pattern in the air — a map only the dead could read. “Three levels below. The Warden guards it. The Warden does not speak. The Warden does not negotiate.”",
      "Pushyanth nodded. He had not come to negotiate. He had come to read what no living eyes had read in a thousand years — the original architecture of the dungeon itself, the blueprint of its creation, the name of the one who had first commanded the dead to rise and serve.",
      "The archivist handed him a lantern that burned with soul-fire. It cast no shadow. It cast only memory. And in its light, the path downward revealed itself — not in stone, but in the footprints of every necromancer who had walked it before him.",
    ],
  },
  {
    title: "III. The Core",
    paras: [
      "At the bottom of the dungeon, where the stone became warm and the air hummed with ancient power, Pushyanth found it — the dungeoncore. Not a crystal, not an artifact, but a heart. A great, slow-beating heart of compressed magic and bone, pulsing with the rhythm of every soul that had ever walked these halls.",
      "The Warden stood before it, a colossus of fused skeletons, ten thousand dead in one form, silent and waiting. It did not attack. It assessed. And in its eye-sockets — a hundred pairs, blinking in sequence — Pushyanth saw recognition.",
      "“You are not the first to reach me,” the Warden spoke, its voice the grinding of bone on stone. “But you are the first who did not come to take. You came to understand.” The colossus parted like a curtain, revealing the core in its entirety — and with it, the truth that the dungeon was not a prison, not a labyrinth, but a library. And the dead were its librarians.",
      "Pushyanth placed his hand on the core. The mark on his wrist flared. And the dungeon — all hundred levels, all ten thousand corridors, all its silent guardians — turned its attention to the new necromancer, and for the first time in a millennium, it spoke his name.",
    ],
  },
];

const FIELD_NOTES: { title: string; paras: string[] }[] = [
  {
    title: "Morning: The White Study",
    paras: [
      "Begin with the honest hour. Morning light is the least sentimental of all lights: it arrives without warmth, all angles and inventory, turning the desk into a ledger of everything you failed to finish. Writers have always known this and pretended otherwise.",
      "Note the behavior of dust. In morning light every room briefly admits its own archaeology — the slow snowfall of skin and paper and fabric that settles while we sleep and dream of being elsewhere. To watch dust is to watch time agreeing to be visible.",
      "The window is not a frame but a collaborator. It edits the world down to one bright paragraph and asks you to read it aloud. Most mornings, the paragraph is about weather. Some mornings, it is about you.",
    ],
  },
  {
    title: "Noon: Saturation",
    paras: [
      "By noon the light has stopped narrating and started shouting. Shadows retreat to their smallest selves, huddled under benches and bicycles like punctuation no one needs. Color becomes rumor: the red of a door is no longer the door's opinion but the sun's.",
      "This is the hour photographers mistrust and lizards adore. Noon is light without subtext. It illuminates everything and explains nothing, which may be why we spend it indoors, behind glass, drinking cold things and calling it a break.",
      "Still, give noon its due. It is the only hour when the world refuses metaphor. A wall is a wall. A street is a street. There is a relief in being seen so completely that nothing can be implied.",
    ],
  },
  {
    title: "Evening: The Long Fade",
    paras: [
      "Evening is light remembering it had a body. The gold returns, low and apologetic, stretching every shadow into a memory of morning. Rooms go amber. Faces go kind. The whole city briefly forgives itself, which is what dusk has always been for.",
      "Watch a window from across the street at this hour. Behind each pane a small stage lights itself: someone setting a table, someone reading, someone standing exactly where you once stood, looking out at exactly your angle of dark. We are all lamplighters to each other, whether we carry the pole or only the light.",
      "The last of it goes not out but in — the light folds itself into lamps, screens, candles, the small kept fires we maintain against the ledger of night. This is the oldest technology we have: the refusal to let the day end without a witness. Every lit window is a signature.",
    ],
  },
];

function buildRow(id: string, title: string, author: string, sourceType: DocumentRow["sourceType"], sections: { title: string; paras: string[] }[], progress: number): DocumentRow {
  const chapters = toChapters(sections);
  const text = chapters.flatMap((c) => c.chunks.map((k) => k.text)).join("\n\n");
  const words = text.split(/\s+/).filter(Boolean).length;
  const now = Date.now();
  const totalChunks = chapters.reduce((a, c) => a + c.chunks.length, 0);
  const lastChunk = Math.min(totalChunks - 1, Math.round((progress / 100) * totalChunks));
  return {
    id, userId: getUserId(), title, author, sourceType,
    mimeType: "text/plain", byteSize: new Blob([text]).size,
    status: "ready", error: null, warnings: [], summary: null, language: "en",
    coverGradient: coverGradient(title + id), contentJson: { chapters },
    chapterCount: chapters.length, wordCount: words, charCount: text.length,
    createdAt: now - 86400e3 * 2, updatedAt: now - 3600e3, lastReadAt: now - 3600e3 * 2,
    readingProgress: progress, lastChunkIndex: lastChunk, favorite: title === "Dungeoncore Necromancer",
    tags: [sourceType, "sample"], collection: "Samples",
  };
}

export async function ensureSeed(): Promise<void> {
  const docs = await idbAll<DocumentRow>("documents");
  if (docs.length > 0) return;
  const a = buildRow("doc_dungeoncore", "Dungeoncore Necromancer", "Pushyanth", "txt", DUNGEONCORE, 38);
  const b = buildRow("doc_fieldnotes", "Field Notes on Light", "J. Halloran", "markdown", FIELD_NOTES, 0);
  await idbPut("documents", a);
  await idbPut("documents", b);
  await logActivity("upload", "Seeded sample: “Dungeoncore Necromancer” (TXT, 3 chapters)", a.id);
  await logActivity("upload", "Seeded sample: “Field Notes on Light” (MD, 3 chapters)", b.id);
  await logActivity("read", "Reading “Dungeoncore Necromancer” — 38%", a.id);
}
