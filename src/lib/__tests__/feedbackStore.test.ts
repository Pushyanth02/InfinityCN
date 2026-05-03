import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearUserFeedback,
    listUserFeedback,
    submitUserFeedback,
} from '../runtime/feedbackStore';

describe('feedbackStore', () => {
    beforeEach(() => {
        clearUserFeedback();
    });

    it('stores and returns recent feedback entries', () => {
        submitUserFeedback({
            category: 'ux',
            message: 'The chapter sidebar should remember collapsed state.',
            context: 'reader',
        });
        submitUserFeedback({
            category: 'bug',
            message: 'Word lens should keep focus after lookup.',
            context: 'reader-insights',
        });

        const feedback = listUserFeedback(5);
        expect(feedback).toHaveLength(2);
        expect(feedback[0]?.category).toBe('bug');
        expect(feedback[1]?.category).toBe('ux');
    });

    it('rejects too-short feedback messages', () => {
        const saved = submitUserFeedback({
            category: 'feature',
            message: 'ok',
        });

        expect(saved).toBeNull();
        expect(listUserFeedback()).toHaveLength(0);
    });

    it('normalizes invalid persisted categories to avoid consumer crashes', () => {
        localStorage.setItem(
            'cinematifier:user-feedback:v1',
            JSON.stringify([
                {
                    id: 'legacy-1',
                    category: 123,
                    message: 'Legacy malformed category',
                    createdAt: Date.now(),
                },
            ]),
        );

        const feedback = listUserFeedback(5);
        expect(feedback).toHaveLength(1);
        expect(feedback[0]?.category).toBe('other');
    });
});
