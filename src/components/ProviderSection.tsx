import React from 'react';
import ProviderCard from './ProviderCard';

export interface Provider {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
}

interface ProviderSectionProps {
  providers: Provider[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const ProviderSection: React.FC<ProviderSectionProps> = ({ providers, selectedId, onSelect }) => (
  <div className="cine-provider-grid">
    {providers.map(p => (
      <ProviderCard
        key={p.id}
        id={p.id}
        label={p.label}
        desc={p.desc}
        icon={p.icon}
        color={p.color}
        active={selectedId === p.id}
        onSelect={onSelect}
      />
    ))}
  </div>
);

export default ProviderSection;
