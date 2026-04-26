const FEEDBACK_STORAGE_KEY = 'cinematifier:user-feedback:v1';
const MAX_FEEDBACK_ITEMS = 120;

export type FeedbackCategory = 'bug' | 'ux' | 'feature' | 'other';

export interface UserFeedbackEntry {
    id: string;
    category: FeedbackCategory;
    message: string;
    context?: string;
    createdAt: number;
}

interface SubmitFeedbackInput {
    category: FeedbackCategory;
    message: string;
    context?: string;
}

function getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readFeedbackEntries(): UserFeedbackEntry[] {
    const storage = getStorage();
    if (!storage) return [];

    try {
        const raw = storage.getItem(FEEDBACK_STORAGE_KEY);
        if (!raw) return [];

        const parsed = JSON.parse(raw) as UserFeedbackEntry[];
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter(entry => entry && typeof entry === 'object')
            .filter(entry => typeof entry.message === 'string' && entry.message.trim().length > 0)
            .slice(0, MAX_FEEDBACK_ITEMS);
    } catch {
        return [];
    }
}

function writeFeedbackEntries(entries: UserFeedbackEntry[]): void {
    const storage = getStorage();
    if (!storage) return;

    try {
        storage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_FEEDBACK_ITEMS)));
    } catch {
        // Ignore storage quota/availability errors and keep app usable.
    }
}

export function listUserFeedback(limit = 10): UserFeedbackEntry[] {
    if (limit <= 0) return [];
    return readFeedbackEntries().slice(0, limit);
}

export function submitUserFeedback(input: SubmitFeedbackInput): UserFeedbackEntry | null {
    const message = input.message.trim();
    if (message.length < 5) {
        return null;
    }

    const context = input.context?.trim();
    const nextEntry: UserFeedbackEntry = {
        id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        category: input.category,
        message,
        context: context ? context : undefined,
        createdAt: Date.now(),
    };

    const nextEntries = [nextEntry, ...readFeedbackEntries()];
    writeFeedbackEntries(nextEntries);
    return nextEntry;
}

export function clearUserFeedback(): void {
    const storage = getStorage();
    if (!storage) return;

    try {
        storage.removeItem(FEEDBACK_STORAGE_KEY);
    } catch {
        // Ignore storage errors.
    }
}
