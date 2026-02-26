/**
 * performance.ts — InfinityCN Performance Monitoring Utilities
 *
 * Provides utilities for tracking, measuring, and reporting
 * performance metrics throughout the application.
 */

// ═══════════════════════════════════════════════════════════
// 1. PERFORMANCE METRICS TYPES
// ═══════════════════════════════════════════════════════════

export interface PerformanceMetric {
    name: string;
    duration: number; // milliseconds
    timestamp: number;
    metadata?: Record<string, unknown>;
}

export interface PerformanceReport {
    totalDuration: number;
    metrics: PerformanceMetric[];
    summary: {
        avgDuration: number;
        maxDuration: number;
        minDuration: number;
        count: number;
    };
}

// ═══════════════════════════════════════════════════════════
// 2. PERFORMANCE TRACKER
// ═══════════════════════════════════════════════════════════

const metrics: PerformanceMetric[] = [];
const MAX_METRICS = 100; // Rolling window

/**
 * Track the execution time of a synchronous function
 */
export function trackSync<T>(name: string, fn: () => T, metadata?: Record<string, unknown>): T {
    const start = performance.now();
    try {
        return fn();
    } finally {
        const duration = performance.now() - start;
        recordMetric(name, duration, metadata);
    }
}

/**
 * Track the execution time of an async function
 */
export async function trackAsync<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
): Promise<T> {
    const start = performance.now();
    try {
        return await fn();
    } finally {
        const duration = performance.now() - start;
        recordMetric(name, duration, metadata);
    }
}

/**
 * Create a performance marker for manual timing
 */
export function createMarker(name: string): {
    stop: (metadata?: Record<string, unknown>) => number;
} {
    const start = performance.now();
    return {
        stop: (metadata?: Record<string, unknown>) => {
            const duration = performance.now() - start;
            recordMetric(name, duration, metadata);
            return duration;
        },
    };
}

function recordMetric(name: string, duration: number, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
        name,
        duration,
        timestamp: Date.now(),
        metadata,
    };

    metrics.push(metric);

    // Rolling window - remove oldest metrics
    while (metrics.length > MAX_METRICS) {
        metrics.shift();
    }

    // Log slow operations in development
    if (import.meta.env.DEV && duration > 100) {
        console.debug(`[Perf] ${name}: ${duration.toFixed(2)}ms`, metadata);
    }
}

// ═══════════════════════════════════════════════════════════
// 3. REPORTING
// ═══════════════════════════════════════════════════════════

/**
 * Get performance report for a specific operation or all operations
 */
export function getPerformanceReport(operationName?: string): PerformanceReport {
    const filtered = operationName ? metrics.filter(m => m.name === operationName) : metrics;

    if (filtered.length === 0) {
        return {
            totalDuration: 0,
            metrics: [],
            summary: { avgDuration: 0, maxDuration: 0, minDuration: 0, count: 0 },
        };
    }

    const durations = filtered.map(m => m.duration);
    const totalDuration = durations.reduce((a, b) => a + b, 0);

    return {
        totalDuration,
        metrics: [...filtered],
        summary: {
            avgDuration: totalDuration / filtered.length,
            maxDuration: Math.max(...durations),
            minDuration: Math.min(...durations),
            count: filtered.length,
        },
    };
}

/**
 * Clear all recorded metrics
 */
export function clearMetrics(): void {
    metrics.length = 0;
}

/**
 * Get recent metrics (last N)
 */
export function getRecentMetrics(count: number = 10): PerformanceMetric[] {
    return metrics.slice(-count);
}

// ═══════════════════════════════════════════════════════════
// 4. WEB VITALS INTEGRATION (Optional)
// ═══════════════════════════════════════════════════════════

export interface WebVitalsMetric {
    name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
}

/**
 * Simple Core Web Vitals thresholds
 */
const WEB_VITALS_THRESHOLDS = {
    CLS: { good: 0.1, poor: 0.25 },
    FCP: { good: 1800, poor: 3000 },
    FID: { good: 100, poor: 300 },
    INP: { good: 200, poor: 500 },
    LCP: { good: 2500, poor: 4000 },
    TTFB: { good: 800, poor: 1800 },
};

/**
 * Rate a Web Vitals metric
 */
export function rateWebVital(
    name: keyof typeof WEB_VITALS_THRESHOLDS,
    value: number,
): WebVitalsMetric['rating'] {
    const thresholds = WEB_VITALS_THRESHOLDS[name];
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.poor) return 'needs-improvement';
    return 'poor';
}

// ═══════════════════════════════════════════════════════════
// 5. MEMORY MONITORING (Browser API)
// ═══════════════════════════════════════════════════════════

export interface MemoryInfo {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    usagePercent: number;
}

/**
 * Get current memory usage (Chrome only)
 */
export function getMemoryInfo(): MemoryInfo | null {
    const memory = (
        performance as Performance & {
            memory?: {
                usedJSHeapSize: number;
                totalJSHeapSize: number;
                jsHeapSizeLimit: number;
            };
        }
    ).memory;

    if (!memory) return null;

    return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usagePercent: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
    };
}

// ═══════════════════════════════════════════════════════════
// 6. PROCESSING TIME ESTIMATOR
// ═══════════════════════════════════════════════════════════

/**
 * Estimate processing time based on text length
 * Uses historical data to predict future performance
 */
export function estimateProcessingTime(textLength: number): {
    estimated: number;
    confidence: 'low' | 'medium' | 'high';
} {
    // Get historical metrics for text processing
    const processingMetrics = metrics.filter(
        m => m.name.includes('parse') || m.name.includes('process'),
    );

    if (processingMetrics.length < 3) {
        // Low confidence - use baseline estimate
        // ~0.5ms per 100 characters based on typical performance
        return {
            estimated: Math.max(100, (textLength / 100) * 0.5),
            confidence: 'low',
        };
    }

    // Calculate average processing rate from history
    const withLength = processingMetrics.filter(m => typeof m.metadata?.textLength === 'number');

    if (withLength.length >= 3) {
        const rates = withLength.map(m => m.duration / (m.metadata!.textLength as number));
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
        return {
            estimated: Math.max(100, textLength * avgRate),
            confidence: 'high',
        };
    }

    // Medium confidence - use average duration scaled
    const avgDuration =
        processingMetrics.reduce((a, m) => a + m.duration, 0) / processingMetrics.length;
    return {
        estimated: avgDuration * (textLength / 10000), // Scale based on ~10k char baseline
        confidence: 'medium',
    };
}

// ═══════════════════════════════════════════════════════════
// 7. FORMATTERS
// ═══════════════════════════════════════════════════════════

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
