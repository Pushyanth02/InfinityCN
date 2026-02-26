import { describe, it, expect, beforeEach } from 'vitest';
import {
    trackSync,
    trackAsync,
    createMarker,
    getPerformanceReport,
    clearMetrics,
    getRecentMetrics,
    rateWebVital,
    formatDuration,
    formatBytes,
    estimateProcessingTime,
} from '../performance';

describe('Performance Monitoring', () => {
    beforeEach(() => {
        clearMetrics();
    });

    describe('trackSync', () => {
        it('tracks synchronous function execution', () => {
            const result = trackSync('test-sync', () => {
                return 42;
            });

            expect(result).toBe(42);

            const metrics = getRecentMetrics(1);
            expect(metrics.length).toBe(1);
            expect(metrics[0].name).toBe('test-sync');
            expect(metrics[0].duration).toBeGreaterThanOrEqual(0);
        });

        it('includes metadata when provided', () => {
            trackSync('test-with-meta', () => 'hello', { foo: 'bar' });

            const metrics = getRecentMetrics(1);
            expect(metrics[0].metadata).toEqual({ foo: 'bar' });
        });
    });

    describe('trackAsync', () => {
        it('tracks async function execution', async () => {
            const result = await trackAsync('test-async', async () => {
                await new Promise(r => setTimeout(r, 10));
                return 'async-result';
            });

            expect(result).toBe('async-result');

            const metrics = getRecentMetrics(1);
            expect(metrics.length).toBe(1);
            expect(metrics[0].name).toBe('test-async');
            expect(metrics[0].duration).toBeGreaterThanOrEqual(10);
        });
    });

    describe('createMarker', () => {
        it('creates a manual timing marker', async () => {
            const marker = createMarker('manual-test');
            await new Promise(r => setTimeout(r, 5));
            const duration = marker.stop({ customData: true });

            expect(duration).toBeGreaterThanOrEqual(5);

            const metrics = getRecentMetrics(1);
            expect(metrics[0].name).toBe('manual-test');
            expect(metrics[0].metadata).toEqual({ customData: true });
        });
    });

    describe('getPerformanceReport', () => {
        it('returns empty report when no metrics', () => {
            const report = getPerformanceReport();
            expect(report.metrics.length).toBe(0);
            expect(report.summary.count).toBe(0);
        });

        it('calculates correct summary statistics', () => {
            trackSync('op1', () => {}, { duration: 10 });
            trackSync('op2', () => {}, { duration: 20 });
            trackSync('op1', () => {}, { duration: 30 });

            const report = getPerformanceReport();
            expect(report.summary.count).toBe(3);
        });

        it('filters by operation name', () => {
            trackSync('op-a', () => {});
            trackSync('op-b', () => {});
            trackSync('op-a', () => {});

            const reportA = getPerformanceReport('op-a');
            expect(reportA.summary.count).toBe(2);

            const reportB = getPerformanceReport('op-b');
            expect(reportB.summary.count).toBe(1);
        });
    });

    describe('rateWebVital', () => {
        it('rates CLS correctly', () => {
            expect(rateWebVital('CLS', 0.05)).toBe('good');
            expect(rateWebVital('CLS', 0.15)).toBe('needs-improvement');
            expect(rateWebVital('CLS', 0.3)).toBe('poor');
        });

        it('rates LCP correctly', () => {
            expect(rateWebVital('LCP', 2000)).toBe('good');
            expect(rateWebVital('LCP', 3000)).toBe('needs-improvement');
            expect(rateWebVital('LCP', 5000)).toBe('poor');
        });

        it('rates FCP correctly', () => {
            expect(rateWebVital('FCP', 1500)).toBe('good');
            expect(rateWebVital('FCP', 2500)).toBe('needs-improvement');
            expect(rateWebVital('FCP', 4000)).toBe('poor');
        });
    });

    describe('formatDuration', () => {
        it('formats microseconds', () => {
            expect(formatDuration(0.5)).toBe('500μs');
        });

        it('formats milliseconds', () => {
            expect(formatDuration(100)).toBe('100.0ms');
            expect(formatDuration(999.5)).toBe('999.5ms');
        });

        it('formats seconds', () => {
            expect(formatDuration(1500)).toBe('1.50s');
            expect(formatDuration(30000)).toBe('30.00s');
        });

        it('formats minutes', () => {
            expect(formatDuration(120000)).toBe('2.00m');
        });
    });

    describe('formatBytes', () => {
        it('formats bytes', () => {
            expect(formatBytes(500)).toBe('500B');
        });

        it('formats kilobytes', () => {
            expect(formatBytes(1536)).toBe('1.5KB');
        });

        it('formats megabytes', () => {
            expect(formatBytes(1048576)).toBe('1.0MB');
        });

        it('formats gigabytes', () => {
            expect(formatBytes(1073741824)).toBe('1.00GB');
        });
    });

    describe('estimateProcessingTime', () => {
        it('returns low confidence estimate with no history', () => {
            const estimate = estimateProcessingTime(10000);
            expect(estimate.confidence).toBe('low');
            expect(estimate.estimated).toBeGreaterThan(0);
        });
    });
});
