/**
 * MangaCard.tsx — Manga card component for grid display
 * 
 * Displays manga cover, title, rating, and status in a card format.
 * Uses lazy loading for cover images.
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { Star, BookOpen, Clock, CheckCircle, PauseCircle, XCircle } from 'lucide-react';
import type { MangaWithMeta } from '../hooks/useMangaDex';

interface MangaCardProps {
    manga: MangaWithMeta;
    onClick: () => void;
    index: number;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    ongoing: { icon: <Clock size={12} />, label: 'Ongoing', color: '#22c55e' },
    completed: { icon: <CheckCircle size={12} />, label: 'Completed', color: '#3b82f6' },
    hiatus: { icon: <PauseCircle size={12} />, label: 'Hiatus', color: '#f59e0b' },
    cancelled: { icon: <XCircle size={12} />, label: 'Cancelled', color: '#ef4444' },
};

const MangaCardComponent: React.FC<MangaCardProps> = ({ manga, onClick, index }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    
    // Intersection Observer for lazy loading
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && imgRef.current && manga.coverUrl) {
                        imgRef.current.src = manga.coverUrl;
                        observer.disconnect();
                    }
                });
            },
            { rootMargin: '100px' }
        );
        
        if (cardRef.current) {
            observer.observe(cardRef.current);
        }
        
        return () => observer.disconnect();
    }, [manga.coverUrl]);
    
    const status = STATUS_CONFIG[manga.manga.attributes.status] || STATUS_CONFIG.ongoing;
    const contentRating = manga.manga.attributes.contentRating;
    const year = manga.manga.attributes.year;
    
    // Extract first 2 genres from tags
    const genres = manga.manga.attributes.tags
        .filter(tag => {
            const group = (tag.attributes as { group?: string })?.group;
            return group === 'genre';
        })
        .slice(0, 2)
        .map(tag => {
            const name = tag.attributes?.name;
            return name?.['en'] || Object.values(name || {})[0] || '';
        })
        .filter(Boolean);
    
    return (
        <div
            ref={cardRef}
            className="manga-card"
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            role="button"
            tabIndex={0}
            aria-label={`View ${manga.title}`}
            style={{ '--card-index': index } as React.CSSProperties}
        >
            {/* Cover Image */}
            <div className="manga-card-cover">
                {!imageLoaded && !imageError && (
                    <div className="manga-card-cover-skeleton">
                        <BookOpen size={32} />
                    </div>
                )}
                {imageError && (
                    <div className="manga-card-cover-error">
                        <BookOpen size={32} />
                        <span>No Cover</span>
                    </div>
                )}
                <img
                    ref={imgRef}
                    alt={manga.title}
                    className={`manga-card-cover-img ${imageLoaded ? 'loaded' : ''}`}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                    loading="lazy"
                />
                
                {/* Status Badge */}
                <div 
                    className="manga-card-status"
                    style={{ '--status-color': status.color } as React.CSSProperties}
                >
                    {status.icon}
                    <span>{status.label}</span>
                </div>
                
                {/* Content Rating */}
                {contentRating && contentRating !== 'safe' && (
                    <div className={`manga-card-rating manga-card-rating--${contentRating}`}>
                        {contentRating === 'suggestive' ? '16+' : '18+'}
                    </div>
                )}
            </div>
            
            {/* Info */}
            <div className="manga-card-info">
                <h3 className="manga-card-title" title={manga.title}>
                    {manga.title}
                </h3>
                
                {/* Genres */}
                {genres.length > 0 && (
                    <div className="manga-card-genres">
                        {genres.map((genre, i) => (
                            <span key={i} className="manga-card-genre">{genre}</span>
                        ))}
                    </div>
                )}
                
                {/* Year */}
                {year && (
                    <div className="manga-card-year">
                        {year}
                    </div>
                )}
                
                {/* Enriched indicator */}
                {manga.isEnriched && (
                    <div className="manga-card-enriched" title="AI-enriched metadata available">
                        <Star size={10} fill="currentColor" />
                    </div>
                )}
            </div>
        </div>
    );
};

export const MangaCard = memo(MangaCardComponent);
MangaCard.displayName = 'MangaCard';
