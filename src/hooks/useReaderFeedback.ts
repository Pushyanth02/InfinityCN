import { useCallback, useMemo, useState } from 'react';
import {
    listUserFeedback,
    submitUserFeedback,
    type FeedbackCategory,
    type UserFeedbackEntry,
} from '../lib/runtime/feedbackStore';

const MAX_FEEDBACK_HISTORY = 6;

interface UseReaderFeedbackResult {
    feedbackMessage: string;
    setFeedbackMessage: (value: string) => void;
    feedbackCategory: FeedbackCategory;
    setFeedbackCategory: (value: FeedbackCategory) => void;
    feedbackError: string | null;
    feedbackSuccess: string | null;
    recentFeedback: UserFeedbackEntry[];
    submitFeedback: (context?: string) => void;
}

export function useReaderFeedback(): UseReaderFeedbackResult {
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>('ux');
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
    const [refreshIndex, setRefreshIndex] = useState(0);

    const recentFeedback = useMemo(
        () => listUserFeedback(MAX_FEEDBACK_HISTORY),
        [refreshIndex],
    );

    const submitFeedback = useCallback(
        (context?: string) => {
            const saved = submitUserFeedback({
                category: feedbackCategory,
                message: feedbackMessage,
                context,
            });

            if (!saved) {
                setFeedbackSuccess(null);
                setFeedbackError('Write at least 5 characters so we can track the suggestion.');
                return;
            }

            setFeedbackMessage('');
            setFeedbackError(null);
            setFeedbackSuccess('Thanks! Your feedback was saved for follow-up.');
            setRefreshIndex(current => current + 1);
        },
        [feedbackCategory, feedbackMessage],
    );

    return {
        feedbackMessage,
        setFeedbackMessage,
        feedbackCategory,
        setFeedbackCategory,
        feedbackError,
        feedbackSuccess,
        recentFeedback,
        submitFeedback,
    };
}
