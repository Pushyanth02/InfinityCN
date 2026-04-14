import { beforeEach, describe, expect, it } from 'vitest';
import { processBookAsync } from '../processing/bookAsyncProcessor';
import { clearJobs, completeJob, createJob, getJob, setJobSourceText } from '../processing/pdfJobs';

function makeFile(name = 'chunked.pdf', type = 'application/pdf'): File {
    return new File([new Blob(['sample'], { type })], name, { type });
}

function makeLongText(): string {
    return [
        'The rain pressed against the old station windows while the platform lights flickered.',
        'Mara checked the map twice and listened for footsteps in the empty hallway.',
        'A distant siren bent through the night air and echoed across the tracks.',
        'Jon whispered that they only had minutes before the patrol reached the tunnel.',
        'They moved through the service door as the metal latch snapped behind them.',
    ].join('\n\n');
}

describe('processBookAsync', () => {
    beforeEach(() => {
        clearJobs();
    });

    it('processes text in chunks and persists partial completion checkpoints', async () => {
        const job = createJob(makeFile());
        setJobSourceText(job.id, makeLongText());

        const partial = await processBookAsync(job.id, {
            chunkSize: 120,
            maxChunksPerRun: 1,
            progressStart: 20,
            progressEnd: 60,
        });

        const checkpoint = getJob(job.id);
        expect(partial.length).toBeGreaterThan(0);
        expect(checkpoint?.status).toBe('processing');
        expect((checkpoint?.processedChunks ?? 0) > 0).toBe(true);
        expect((checkpoint?.totalChunks ?? 0) >= (checkpoint?.processedChunks ?? 0)).toBe(true);
        expect((checkpoint?.progress ?? 0) >= 20).toBe(true);
        expect((checkpoint?.progress ?? 0) <= 60).toBe(true);
    });

    it('resumes from checkpoint and allows explicit completion', async () => {
        const job = createJob(makeFile('resume.pdf'));
        setJobSourceText(job.id, makeLongText());

        await processBookAsync(job.id, {
            chunkSize: 120,
            maxChunksPerRun: 1,
            progressStart: 10,
            progressEnd: 70,
        });

        const resumed = await processBookAsync(job.id, {
            chunkSize: 120,
            progressStart: 10,
            progressEnd: 70,
        });

        const processed = getJob(job.id);
        expect(processed?.processedChunks).toBe(processed?.totalChunks);
        expect(resumed.length).toBeGreaterThan(0);

        const completed = completeJob(job.id, resumed);
        expect(completed?.status).toBe('complete');
        expect(completed?.progress).toBe(100);
        expect(completed?.result).toBe(resumed);
    });
});
