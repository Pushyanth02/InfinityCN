/**
 * utils.ts — InfinityCN System Utilities
 *
 * Features:
 *   • Export functionality (JSON, Markdown, HTML)
 *   • Statistics aggregation
 *   • Bookmark system
 *   • Search functionality
 *   • Data compression
 */

import type { MangaPanel, Character, ChapterInsights } from '../types';

// ═══════════════════════════════════════════════════════════
// ── EXPORT FUNCTIONALITY ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface ExportData {
    title: string;
    exportedAt: string;
    panels: MangaPanel[];
    characters: Character[];
    insights?: ChapterInsights;
    statistics?: ChapterStatistics;
}

export type ExportFormat = 'json' | 'markdown' | 'html';

/**
 * Export chapter data to various formats.
 */
export function exportChapter(
    title: string,
    panels: MangaPanel[],
    characters: Character[],
    insights?: ChapterInsights,
    format: ExportFormat = 'json'
): string {
    const data: ExportData = {
        title,
        exportedAt: new Date().toISOString(),
        panels,
        characters,
        insights,
        statistics: computeChapterStatistics(panels, characters)
    };

    switch (format) {
        case 'json':
            return exportToJSON(data);
        case 'markdown':
            return exportToMarkdown(data);
        case 'html':
            return exportToHTML(data);
        default:
            return exportToJSON(data);
    }
}

function exportToJSON(data: ExportData): string {
    return JSON.stringify(data, null, 2);
}

function exportToMarkdown(data: ExportData): string {
    const lines: string[] = [];
    
    lines.push(`# ${data.title}`);
    lines.push(`*Exported: ${new Date(data.exportedAt).toLocaleString()}*`);
    lines.push('');
    
    // Statistics
    if (data.statistics) {
        lines.push('## Statistics');
        lines.push(`- **Total Panels:** ${data.statistics.totalPanels}`);
        lines.push(`- **Word Count:** ${data.statistics.wordCount.toLocaleString()}`);
        lines.push(`- **Reading Time:** ${data.statistics.readingTimeMinutes} minutes`);
        lines.push(`- **Characters:** ${data.statistics.characterCount}`);
        lines.push('');
    }
    
    // Characters
    if (data.characters.length > 0) {
        lines.push('## Characters');
        for (const char of data.characters) {
            lines.push(`### ${char.name}`);
            if (char.description) lines.push(char.description);
            if (char.frequency) lines.push(`*Mentions: ${char.frequency}*`);
            lines.push('');
        }
    }
    
    // Insights
    if (data.insights) {
        lines.push('## Chapter Insights');
        lines.push(`- **Readability:** ${data.insights.readability.fleschKincaid.toFixed(1)} (grade level)`);
        if (data.insights.extractiveRecap) {
            lines.push('');
            lines.push('### Recap');
            lines.push(data.insights.extractiveRecap);
        }
        lines.push('');
    }
    
    // Content
    lines.push('## Content');
    for (let i = 0; i < data.panels.length; i++) {
        const panel = data.panels[i];
        lines.push(`### Panel ${i + 1}`);
        lines.push(panel.content);
        lines.push('');
    }
    
    return lines.join('\n');
}

function exportToHTML(data: ExportData): string {
    const escapeHtml = (str: string) => str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(data.title)} - InfinityCN Export</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
        h1 { color: #1a1a2e; border-bottom: 2px solid #6c63ff; padding-bottom: 0.5rem; }
        h2 { color: #16213e; margin-top: 2rem; }
        .stats { background: #f0f0f5; padding: 1rem; border-radius: 8px; }
        .character { border-left: 3px solid #6c63ff; padding-left: 1rem; margin: 1rem 0; }
        .panel { background: #fafafa; padding: 1rem; margin: 1rem 0; border-radius: 4px; }
        .meta { color: #666; font-size: 0.9rem; }
    </style>
</head>
<body>
    <h1>${escapeHtml(data.title)}</h1>
    <p class="meta">Exported: ${new Date(data.exportedAt).toLocaleString()}</p>`;

    if (data.statistics) {
        html += `
    <div class="stats">
        <h2>Statistics</h2>
        <ul>
            <li><strong>Panels:</strong> ${data.statistics.totalPanels}</li>
            <li><strong>Words:</strong> ${data.statistics.wordCount.toLocaleString()}</li>
            <li><strong>Reading Time:</strong> ${data.statistics.readingTimeMinutes} min</li>
            <li><strong>Characters:</strong> ${data.statistics.characterCount}</li>
        </ul>
    </div>`;
    }

    if (data.characters.length > 0) {
        html += '\n    <h2>Characters</h2>';
        for (const char of data.characters) {
            html += `
    <div class="character">
        <h3>${escapeHtml(char.name)}</h3>
        ${char.description ? `<p>${escapeHtml(char.description)}</p>` : ''}
        ${char.frequency ? `<p class="meta">Mentions: ${char.frequency}</p>` : ''}
    </div>`;
        }
    }

    html += '\n    <h2>Content</h2>';
    for (let i = 0; i < data.panels.length; i++) {
        const panel = data.panels[i];
        html += `
    <div class="panel">
        <strong>Panel ${i + 1}</strong>
        <p>${escapeHtml(panel.content)}</p>
    </div>`;
    }

    html += `
</body>
</html>`;

    return html;
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType = 'application/json'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════
// ── STATISTICS AGGREGATION ─────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface ChapterStatistics {
    totalPanels: number;
    wordCount: number;
    characterCount: number;
    sentenceCount: number;
    paragraphCount: number;
    readingTimeMinutes: number;
    averagePanelLength: number;
    longestPanel: number;
    shortestPanel: number;
    atmosphereDistribution: Record<string, number>;
}

/**
 * Compute comprehensive statistics for a chapter.
 */
export function computeChapterStatistics(
    panels: MangaPanel[],
    characters: Character[]
): ChapterStatistics {
    const allText = panels.map(p => p.content).join(' ');
    const words = allText.split(/\s+/).filter(w => w.length > 0);
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = allText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    const panelLengths = panels.map(p => p.content.split(/\s+/).length);
    
    // Type distribution (instead of atmosphere)
    const atmosphereDistribution: Record<string, number> = {};
    for (const panel of panels) {
        const type = panel.type;
        atmosphereDistribution[type] = (atmosphereDistribution[type] || 0) + 1;
    }
    
    // Reading time: ~200 WPM, adjusted for complexity
    const readingTimeMinutes = Math.ceil(words.length / 200);
    
    return {
        totalPanels: panels.length,
        wordCount: words.length,
        characterCount: characters.length,
        sentenceCount: sentences.length,
        paragraphCount: Math.max(paragraphs.length, panels.length),
        readingTimeMinutes,
        averagePanelLength: panels.length > 0 ? Math.round(words.length / panels.length) : 0,
        longestPanel: panelLengths.length > 0 ? Math.max(...panelLengths) : 0,
        shortestPanel: panelLengths.length > 0 ? Math.min(...panelLengths) : 0,
        atmosphereDistribution
    };
}

// ═══════════════════════════════════════════════════════════
// ── BOOKMARK SYSTEM ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface Bookmark {
    id: string;
    chapterId: string;
    panelIndex: number;
    label?: string;
    note?: string;
    createdAt: number;
    color?: string;
}

const BOOKMARKS_KEY = 'infinitycn_bookmarks';

/**
 * Get all bookmarks from localStorage.
 */
export function getBookmarks(): Bookmark[] {
    try {
        const data = localStorage.getItem(BOOKMARKS_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/**
 * Add a new bookmark.
 */
export function addBookmark(chapterId: string, panelIndex: number, label?: string, note?: string, color?: string): Bookmark {
    const bookmarks = getBookmarks();
    const bookmark: Bookmark = {
        id: `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        chapterId,
        panelIndex,
        label,
        note,
        createdAt: Date.now(),
        color
    };
    bookmarks.push(bookmark);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    return bookmark;
}

/**
 * Remove a bookmark by ID.
 */
export function removeBookmark(id: string): boolean {
    const bookmarks = getBookmarks();
    const filtered = bookmarks.filter(b => b.id !== id);
    if (filtered.length < bookmarks.length) {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(filtered));
        return true;
    }
    return false;
}

/**
 * Get bookmarks for a specific chapter.
 */
export function getChapterBookmarks(chapterId: string): Bookmark[] {
    return getBookmarks().filter(b => b.chapterId === chapterId);
}

/**
 * Update a bookmark.
 */
export function updateBookmark(id: string, updates: Partial<Omit<Bookmark, 'id' | 'createdAt'>>): Bookmark | null {
    const bookmarks = getBookmarks();
    const index = bookmarks.findIndex(b => b.id === id);
    if (index === -1) return null;
    
    bookmarks[index] = { ...bookmarks[index], ...updates };
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    return bookmarks[index];
}

// ═══════════════════════════════════════════════════════════
// ── SEARCH FUNCTIONALITY ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface SearchResult {
    panelIndex: number;
    text: string;
    matchStart: number;
    matchEnd: number;
    context: string;
}

/**
 * Search for text within panels.
 */
export function searchPanels(panels: MangaPanel[], query: string, caseSensitive = false): SearchResult[] {
    if (!query.trim()) return [];
    
    const results: SearchResult[] = [];
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    
    for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        const searchText = caseSensitive ? panel.content : panel.content.toLowerCase();
        
        let startIndex = 0;
        while (true) {
            const matchIndex = searchText.indexOf(searchQuery, startIndex);
            if (matchIndex === -1) break;
            
            // Extract context (50 chars before and after)
            const contextStart = Math.max(0, matchIndex - 50);
            const contextEnd = Math.min(panel.content.length, matchIndex + query.length + 50);
            let context = panel.content.substring(contextStart, contextEnd);
            if (contextStart > 0) context = '...' + context;
            if (contextEnd < panel.content.length) context = context + '...';
            
            results.push({
                panelIndex: i,
                text: panel.content.substring(matchIndex, matchIndex + query.length),
                matchStart: matchIndex,
                matchEnd: matchIndex + query.length,
                context
            });
            
            startIndex = matchIndex + 1;
        }
    }
    
    return results;
}

/**
 * Search with regex support.
 */
export function searchPanelsRegex(panels: MangaPanel[], pattern: string, flags = 'gi'): SearchResult[] {
    try {
        const regex = new RegExp(pattern, flags);
        const results: SearchResult[] = [];
        
        for (let i = 0; i < panels.length; i++) {
            const panel = panels[i];
            let match: RegExpExecArray | null;
            
            while ((match = regex.exec(panel.content)) !== null) {
                const matchIndex = match.index;
                const matchText = match[0];
                
                const contextStart = Math.max(0, matchIndex - 50);
                const contextEnd = Math.min(panel.content.length, matchIndex + matchText.length + 50);
                let context = panel.content.substring(contextStart, contextEnd);
                if (contextStart > 0) context = '...' + context;
                if (contextEnd < panel.content.length) context = context + '...';
                
                results.push({
                    panelIndex: i,
                    text: matchText,
                    matchStart: matchIndex,
                    matchEnd: matchIndex + matchText.length,
                    context
                });
                
                // Prevent infinite loop for zero-length matches
                if (match[0].length === 0) regex.lastIndex++;
            }
        }
        
        return results;
    } catch {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════
// ── TEXT UTILITIES ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Highlight search matches in text with HTML span tags.
 */
export function highlightMatches(text: string, query: string, className = 'highlight'): string {
    if (!query.trim()) return text;
    
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, `<span class="${className}">$1</span>`);
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number, ellipsis = '...'): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Calculate text similarity using Jaccard index.
 */
export function textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
}

// ═══════════════════════════════════════════════════════════
// ── RECENT CHAPTERS HISTORY ────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface RecentChapter {
    id: string;
    title: string;
    lastRead: number;
    lastPanelIndex: number;
    progress: number; // 0-1
}

const RECENT_KEY = 'infinitycn_recent';
const MAX_RECENT = 20;

/**
 * Get recent chapters list.
 */
export function getRecentChapters(): RecentChapter[] {
    try {
        const data = localStorage.getItem(RECENT_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/**
 * Update reading progress for a chapter.
 */
export function updateReadingProgress(
    id: string, 
    title: string, 
    panelIndex: number, 
    totalPanels: number
): void {
    const recent = getRecentChapters();
    const existing = recent.findIndex(r => r.id === id);
    
    const entry: RecentChapter = {
        id,
        title,
        lastRead: Date.now(),
        lastPanelIndex: panelIndex,
        progress: totalPanels > 0 ? panelIndex / totalPanels : 0
    };
    
    if (existing !== -1) {
        recent.splice(existing, 1);
    }
    
    recent.unshift(entry);
    
    // Keep only MAX_RECENT entries
    while (recent.length > MAX_RECENT) {
        recent.pop();
    }
    
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

/**
 * Clear reading history.
 */
export function clearRecentHistory(): void {
    localStorage.removeItem(RECENT_KEY);
}
