import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearJobs,
    completeJob,
    createJob,
    getJob,
    listJobs,
    savePartialCompletion,
    setJobSourceText,
    updateProgress,
} from '../processing/pdfJobs';

function makeFile(name = 'chapter.pdf', type = 'application/pdf'): File {
    return new File([new Blob(['hello world'], { type })], name, { type });
}

describe('pdfJobs', () => {
    beforeEach(() => {
        clearJobs();
    });

    it('createJob stores a new job with created status', () => {
        const job = createJob(makeFile('novel.pdf'));

        expect(job.id).toContain('pdf-job-');
        expect(job.fileName).toBe('novel.pdf');
        expect(job.status).toBe('created');
        expect(job.progress).toBe(0);
        expect(job.result).toBeNull();
    });

    it('updateProgress transitions job to processing and updates percentage', () => {
        const job = createJob(makeFile());

        const updated = updateProgress(job.id, 42);
        expect(updated).not.toBeNull();
        expect(updated?.status).toBe('processing');
        expect(updated?.progress).toBe(42);

        const stored = getJob(job.id);
        expect(stored?.progress).toBe(42);
    });

    it('completeJob marks job complete with result payload', () => {
        const job = createJob(makeFile('book.pdf'));
        updateProgress(job.id, 75);

        const completed = completeJob(job.id, 'Processed 12/12 chapters from book.pdf');
        expect(completed).not.toBeNull();
        expect(completed?.status).toBe('complete');
        expect(completed?.progress).toBe(100);
        expect(completed?.result).toContain('12/12 chapters');
    });

    it('stores source text and chunk checkpoint data for resumable processing', () => {
        const job = createJob(makeFile('resume.pdf'));
        const source = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';

        const withSource = setJobSourceText(job.id, source);
        expect(withSource?.sourceText).toContain('First paragraph');
        expect(withSource?.processedChunks).toBe(0);
        expect(withSource?.totalChunks).toBe(0);

        const checkpoint = savePartialCompletion(job.id, 'First paragraph.', 1, 3, 33);
        expect(checkpoint?.status).toBe('processing');
        expect(checkpoint?.progress).toBe(33);
        expect(checkpoint?.processedChunks).toBe(1);
        expect(checkpoint?.totalChunks).toBe(3);
        expect(checkpoint?.result).toBe('First paragraph.');
    });

    it('returns jobs from listJobs ordered by most recent update', () => {
        const first = createJob(makeFile('first.pdf'));
        const second = createJob(makeFile('second.pdf'));

        updateProgress(first.id, 10);
        updateProgress(second.id, 35);

        const jobs = listJobs();
        expect(jobs.length).toBe(2);
        expect(jobs[0].fileName).toBe('second.pdf');
        expect(jobs[1].fileName).toBe('first.pdf');
    });
});
