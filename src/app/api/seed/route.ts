import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gradientForId } from "@/lib/types";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * SEED ENDPOINT — DEVELOPMENT ONLY.
 *
 * This route is disabled in production. It seeds sample documents for local
 * development and testing. In production, it returns 404.
 */

const SAMPLE_TITLE = "The Library of Liminal Hours";
const SAMPLE_AUTHOR = "Ana Marquez";

const SAMPLE_TEXT = `# The Library of Liminal Hours

## Chapter 1: The Threshold

There are libraries that hold books, and then there are libraries that hold hours. The kind of hours that pool in the corners of a quiet afternoon, that thicken the air between the stacks until you can feel them pressing gently against your skin.

Marguerite had been a librarian for twenty-three years before she understood the difference. It happened on a Tuesday in late October, when the rain had been falling since dawn and the readers had stayed away. She was alone in the building at half past four, reshelving a stray copy of Borges, when she noticed that the light through the western windows had turned the color of old honey.

She paused, book in hand, and listened. The building was silent in the way only old buildings can be silent — not empty, but full of the small sounds of themselves. The soft tick of the radiator. The creak of a floorboard settling. Somewhere, a page turning.

But there was no one else in the building.

She set the Borges on its shelf and walked toward the sound. It came again, softer now, from the rear of the building where the rare books were kept. The rare books room was always colder than the rest of the library; its climate-control system hummed at a frequency just below hearing. Marguerite had always found it comforting.

She pushed open the heavy oak door and stepped inside.

The room was empty. But on the long reading table in the center, a book lay open. Its pages were turning — slowly, deliberately, as if moved by an invisible hand. Marguerite watched as the pages turned, one after another, each one pausing at the top of its arc before settling down.

She did not feel afraid. She felt, instead, the way one feels when a long-expected guest finally arrives.

## Chapter 2: The Bells

The next morning, Marguerite arrived early. She had not slept well. The book had been a collection of essays on the nature of time, published in 1923 by a small press in Buenos Aires. She had read the open page before closing the book and returning it to its proper place on the shelf.

The page had spoken of bells.

"Bells," the essayist had written, "are the only instruments that measure time by cutting it. A bell does not flow. It arrives, complete, and then it is gone. Between two bells, there is a silence that is not the absence of sound but the presence of attention."

Marguerite had been thinking about that silence all night.

She unlocked the library at seven. The building was cold; the heating system had not yet caught up with the morning. She walked through the dark stacks, turning on lights as she went, and paused at the door of the rare books room.

The book was open again.

This time, it was a different book. A slim volume of poetry, this one, published in 1957. The open page held a single poem, untitled:

When the hour turns
on its hidden hinge,
listen for the bell
that does not ring.

She read it twice. Then she closed the book, reshelved it, and went to make the coffee.

## Chapter 3: The Letter

A week passed. Each morning, Marguerite found a different book open on the table in the rare books room. Each book spoke, in its own way, of hours and thresholds and the things that arrive unbidden.

She began to leave the room unlocked at night.

On the eighth morning, she found a letter.

It was folded in quarters and tucked into the open book — a 19th-century manual of horology. The paper was old, slightly yellowed, but the handwriting was fresh. It read:

Dear Marguerite,

You have been listening. That is good. The library has been waiting for a listener for a long time.

There is work to be done, if you are willing. The hours have been pooling here for over a century, and they have begun to forget their shapes. A library that holds hours must also, occasionally, return them.

Tomorrow, at the third bell, come to the rare books room. Bring nothing.

— A friend

Marguerite read the letter three times. Then she folded it again, placed it in her pocket, and went to open the library for the day.

She did not know what the third bell was. But she knew, with the quiet certainty that comes after twenty-three years of paying attention, that she would know it when she heard it.

## Chapter 4: The Third Bell

The day passed slowly. Marguerite shelved books, helped the few readers who came in out of the rain, and answered the phone. She did not go into the rare books room.

At ten minutes to three, she made herself a cup of tea and sat at the front desk. The building was quiet. The rain had stopped; the sky was the color of pewter.

At three o'clock, the bell did not ring.

Marguerite waited. She drank her tea. She watched the light move across the floor.

At seven minutes past three, she heard it — a single, clear tone, like a glass struck by a fingernail. It came from the rare books room.

She set down her cup and walked.

The room was empty, as always. But the air had changed. It was thicker now, almost liquid, and it held a faint scent she could not name — not old paper, not dust, but something else. Something green and patient.

On the table, the book was open. But this time, the pages were not turning. They were still.

Marguerite sat down.

She read.

And the hours, pooled for a century in the corners of that quiet room, began at last to remember their shapes.`;

export async function POST(req: NextRequest) {
  // Block in production — this endpoint is for development/testing only.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rate limit even in development to prevent accidental spam.
  const rl = checkRateLimit(req, RATE_LIMITS.upload);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Idempotent: if a doc with this title exists, return it.
  const existing = await db.document.findFirst({
    where: { title: SAMPLE_TITLE },
  });
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, alreadySeeded: true });
  }

  // Parse the sample text into chapters/chunks (same logic as engine)
  const chapterRe = /^##\s+(.+)$/gm;
  const parts: { title: string; body: string }[] = [];
  let lastIdx = 0;
  let lastTitle = "Opening";
  let m: RegExpExecArray | null;
  // Skip the H1 title
  const h1Match = SAMPLE_TEXT.match(/^#\s+(.+)$/m);
  const docTitle = h1Match?.[1] ?? SAMPLE_TITLE;
  const bodyText = SAMPLE_TEXT.replace(/^#\s+.+\n+/, "");
  chapterRe.lastIndex = 0;
  while ((m = chapterRe.exec(bodyText)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ title: lastTitle, body: bodyText.slice(lastIdx, m.index) });
    }
    lastTitle = m[1].trim();
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < bodyText.length) {
    parts.push({ title: lastTitle, body: bodyText.slice(lastIdx) });
  }

  const chapters = parts.map((p, i) => {
    const chunks = ((): any[] => {
      const out: any[] = [];
      const paras = p.body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      let buf = "";
      let idx = 0;
      let offset = 0;
      let bufStart = 0;
      for (const para of paras) {
        if (buf.length + para.length + 2 > 1200 && buf) {
          out.push({ index: idx++, text: buf.trim(), charOffset: bufStart });
          offset += buf.length + 2;
          buf = para;
          bufStart = offset;
        } else {
          if (buf) buf += "\n\n" + para;
          else {
            buf = para;
            bufStart = offset;
          }
        }
      }
      if (buf.trim()) out.push({ index: idx, text: buf.trim(), charOffset: bufStart });
      return out;
    })();
    return {
      id: Math.random().toString(36).slice(2, 10) + i,
      title: p.title,
      ordinal: i,
      chunks,
    };
  });

  const wordCount = (bodyText.match(/\S+/g) ?? []).length;
  const charCount = bodyText.length;

  const created = await db.document.create({
    data: {
      title: docTitle,
      author: SAMPLE_AUTHOR,
      sourceType: "md",
      mimeType: "text/markdown",
      byteSize: Buffer.byteLength(SAMPLE_TEXT),
      status: "ready",
      language: "en",
      coverGradient: null,
      chapterCount: chapters.length,
      wordCount,
      charCount,
      contentJson: JSON.stringify({ chapters, wordCount, charCount, title: docTitle, author: SAMPLE_AUTHOR, language: "en" }),
      readingProgress: 0.18,
      lastChunkIndex: 2,
      lastReadAt: new Date(Date.now() - 2 * 3600_000),
    },
  });
  const gradient = gradientForId(created.id);
  await db.document.update({ where: { id: created.id }, data: { coverGradient: gradient } });

  // Seed a second short doc — an in-progress tech piece.
  const TECH_TEXT = `# A Note on Persistence

Local-first software makes a simple promise: your data lives where you live. The browser, the device, the file system. Not a server you cannot see.

This is not a rejection of the network. It is a rearrangement of trust. The network becomes a courier, not a custodian.

## The shape of an hour

When you read, you deposit hours. A library that does not remember those deposits is a library that does not know its reader.

## On returning

Every reading session ends. The art is in making the return effortless — opening the book to the same page, the same paragraph, the same breath.`;
  const techChapters = [
    { id: "t1", title: "A Note on Persistence", ordinal: 0, chunks: [{ index: 0, text: TECH_TEXT.slice(0, 600), charOffset: 0 }] },
    { id: "t2", title: "The shape of an hour", ordinal: 1, chunks: [{ index: 0, text: "Local-first software makes a simple promise: your data lives where you live.", charOffset: 0 }] },
    { id: "t3", title: "On returning", ordinal: 2, chunks: [{ index: 0, text: "Every reading session ends. The art is in making the return effortless.", charOffset: 0 }] },
  ];
  const tech = await db.document.create({
    data: {
      title: "A Note on Persistence",
      author: "Lemniscate Press",
      sourceType: "md",
      mimeType: "text/markdown",
      byteSize: Buffer.byteLength(TECH_TEXT),
      status: "ready",
      language: "en",
      chapterCount: techChapters.length,
      wordCount: (TECH_TEXT.match(/\S+/g) ?? []).length,
      charCount: TECH_TEXT.length,
      contentJson: JSON.stringify({ chapters: techChapters, wordCount: (TECH_TEXT.match(/\S+/g) ?? []).length, charCount: TECH_TEXT.length, title: "A Note on Persistence", author: "Lemniscate Press", language: "en" }),
      readingProgress: 0,
      favorite: true,
    },
  });
  await db.document.update({ where: { id: tech.id }, data: { coverGradient: gradientForId(tech.id) } });

  await logActivity({ type: "upload", documentId: created.id, detail: docTitle });
  await logActivity({ type: "upload", documentId: tech.id, detail: "A Note on Persistence" });
  await logActivity({ type: "read", documentId: created.id, detail: docTitle });
  await logActivity({ type: "ai_summarize", documentId: created.id, detail: docTitle });

  return NextResponse.json({ ok: true, id: created.id, alreadySeeded: false });
}
