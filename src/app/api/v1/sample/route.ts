/**
 * POST /api/v1/sample — Enqueue the built-in sample story
 *
 * Creates a Document + Job from a built-in literary sample text so users
 * can try Lemniscate without uploading a file. Deterministic, offline.
 *
 * ?mode=ORIGINAL|CINEMATIFIED|BOTH (default BOTH)
 *
 * Versioned API using the service layer and standard response envelope.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { db } from '@/lib/db'
import { hashText } from '@/lib/pipeline/extract'
import { apiSuccess, apiError, apiValidationError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { dispatchProcessing } from '@/lib/pipeline/dispatch'

const SAMPLE = `The Last Lighthouse of Veyrn

Chapter One: The Storm Arrives

The sea had been whispering all morning, but Elara refused to listen. She stood at the window of the lighthouse keeper's cottage, watching the grey waves chew the rocks below. The lamp in the tower had not been lit in seven years, not since her father vanished into the same water that now clawed at the shore.

"You should not be up here," called Marin from the foot of the stairs. "The council meeting starts at noon."

Elara did not turn. "The council can wait. The sea cannot."

Marin climbed the stairs slowly, his boots heavy on the worn wood. He had been the village fisherman for thirty years, and he knew the difference between a storm and a warning. Today, the sea was warning them.

"Your father said the same thing," Marin murmured. "The night he disappeared."

Elara spun around. "What do you know about that night?"

Marin looked away. "More than I have ever told you. More than I should."

Suddenly, a bell rang from the harbor. Both of them ran to the window. A ship — black-sailed, listing badly — was driving toward the reef. Elara felt her heart race. No ship had come to Veyrn in seven years.

"Sound the alarm!" she shouted. "We have to light the lamp!"

"The lamp is broken," Marin said. "It has been broken since—"

"Then we fix it." Elara grabbed her coat. "Now."

Chapter Two: The Stranger

By the time they reached the harbor, half the village was there. The black-sailed ship had struck the reef and was sinking fast. A single figure clung to the mast, waving a torch.

"Who is it?" asked Bran, the blacksmith, shielding his eyes against the rain.

"I cannot see," Elara said. She turned to Marin. "We need a boat."

Marin shook his head. "No one goes out in this sea. No one survives."

A wave crashed over the ship's deck. The figure lost its grip, fell, and was dragged under.

Elara did not hesitate. She seized the rope from Bran's hands and ran to the nearest fishing boat. "If you will not help me, I will go alone."

"Elara, no!" Marin shouted.

But she had already pushed the boat into the surf. The waves hit her like a fist. She rowed with everything she had, the rope clenched between her teeth. Salt burned her eyes. The boat rose and fell. She reached the wreck just as the figure surfaced again, gasping.

"Grab the rope!" she screamed.

The stranger — a man, young, with dark hair plastered to his face — seized the rope. Elara pulled. The sea pulled harder. For one terrible moment she thought they would both die.

Then Bran was beside her in a second boat, his enormous hands closing on the rope. Together they dragged the stranger into Elara's boat. The black ship gave a groan and sank beneath the waves.

Later, by the fire in the cottage, the stranger opened his eyes.

"You saved me," he whispered. "Why?"

Elara studied him. "Who are you?"

He looked at her, and for a moment she saw fear in his eyes — not the fear of the sea, but the fear of a man with a secret.

"My name is Corin," he said. "And I have come to warn you. The thing that took your father is coming back."

Marin, standing in the doorway, dropped the kettle he was carrying. It clattered on the stone floor.

"You," Marin said, his voice shaking. "I know you. You were on the ship with her father. The night he vanished."

Corin closed his eyes. "Yes."

Chapter Three: The Truth Beneath

The fire crackled. No one spoke for a long time.

Elara's hands trembled. "Tell me. Now. Everything."

Corin sat up slowly. "Your father found something, Elara. Beneath the lighthouse. A door, sealed for a century. He opened it."

"What was behind it?" she whispered.

"A promise," Corin said. "A promise the village made, long ago, to something in the deep. A promise they broke. Your father tried to keep it. The sea took him instead of the village."

Marin groaned and sat down heavily. "I told him not to open that door. I told him."

Elara stood. "Where is this door?"

"Beneath the lighthouse. In the foundations." Corin looked at the window, where the storm still raged. "It will open tonight, on its own. The seven years are up. And what comes through will take the village — unless someone keeps the promise."

"What promise?" Elara demanded.

Corin met her eyes. "A life. Willingly given."

The silence that followed was louder than the storm.

Elara looked at the lighthouse tower, dark against the sky. She thought of her father. She thought of the village sleeping behind her, trusting the morning to come.

"Then I will keep it," she said quietly.

"Elara, no!" Marin cried.

But she was already reaching for the lamp. "Help me light this, Marin. One last time. If I am going down, I am going down showing the way home."

Marin stared at her. Then, slowly, he smiled — a sad, proud, terrible smile.

"Your father would have said the same thing," he whispered. "The night he disappeared."

Together, they climbed the tower. The storm screamed around them. Elara struck the match. The lamp caught, blazed, and threw its light out over the black water — a single golden line, reaching into the dark.

And far below, in the foundations of the lighthouse, something ancient began to stir.

Chapter Four: Dawn

The morning came slowly, grey and wet. The storm had passed. The village woke to find the lighthouse still standing, its lamp cold. Elara was gone.

Marin sat on the rocks below the tower, the empty lamp in his hands. He did not weep. He had wept all he could in the night.

Bran found him there at noon. "Where is she?" the blacksmith asked.

Marin looked out at the calm sea. "She kept the promise," he said. "The village is safe."

Bran knelt beside him. For a long time, neither man spoke.

Finally, Marin stood. He carried the lamp back into the lighthouse and set it in its cradle. "I will keep the light," he said. "For her. For her father. For as long as the sea remembers."

And so he did. Every night, for the rest of his life, Marin lit the lamp of Veyrn. And the sea, which had taken so much from them, never took again.`

export async function POST(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `sample:${getClientIP(req)}`, 5)
    if (blocked) return blocked

    const mode = (req.nextUrl.searchParams.get('mode') as string) || 'BOTH'
    if (!['ORIGINAL', 'CINEMATIFIED', 'BOTH'].includes(mode)) {
      return apiValidationError('Invalid mode. Must be ORIGINAL, CINEMATIFIED, or BOTH.')
    }

    const fileHash = await hashText(SAMPLE)
    const buf = Buffer.from(SAMPLE, 'utf-8')
    const { saveBuffer, buildStorageName } = await import('@/lib/storage')
    const storageName = buildStorageName('the-last-lighthouse-of-veyrn.txt', fileHash)
    await saveBuffer(storageName, buf)

    const existing = await db.document.findFirst({ where: { fileHash } })
    let documentId: string
    if (existing) {
      documentId = existing.id
    } else {
      const doc = await db.document.create({
        data: {
          originalName: 'the-last-lighthouse-of-veyrn.txt',
          storageName,
          mimeType: 'text/plain',
          sizeBytes: buf.length,
          fileHash,
          status: 'UPLOADED',
        },
      })
      documentId = doc.id
    }

    // Dedup: if there's already a QUEUED/PROCESSING job for this doc+mode,
    // return it instead of creating a duplicate.
    const inFlight = await db.job.findFirst({
      where: { documentId, mode, status: { in: ['QUEUED', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    })
    if (inFlight) {
      return apiSuccess({
        documentId,
        jobId: inFlight.id,
        mode,
        status: inFlight.status,
        sampleTitle: 'The Last Lighthouse of Veyrn',
        message: 'A sample job is already in progress.',
      })
    }

    // Also check for completed narratives
    const completedJob = await db.job.findFirst({
      where: { documentId, mode, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      include: { narratives: { select: { id: true, mode: true, title: true, sceneCount: true } } },
    })
    if (completedJob && completedJob.narratives.length > 0) {
      return apiSuccess({
        documentId,
        jobId: completedJob.id,
        mode,
        status: 'COMPLETED',
        sampleTitle: 'The Last Lighthouse of Veyrn',
        message: 'Sample already processed — opening the existing narrative.',
      })
    }

    const job = await db.job.create({
      data: { documentId, mode, status: 'QUEUED', progress: 0, stage: 'QUEUED', priority: 8 },
    })

    void dispatchProcessing(job.id)

    return apiSuccess({
      documentId,
      jobId: job.id,
      mode,
      status: 'QUEUED',
      sampleTitle: 'The Last Lighthouse of Veyrn',
      message: 'Sample narrative enqueued. Processing will begin momentarily.',
    }, 201)
  } catch (err) {
    return apiError(err)
  }
}
