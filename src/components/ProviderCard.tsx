import React from 'react';

interface ProviderCardProps {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
  onSelect: (id: string) => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({ id, label, desc, icon, color, active, onSelect }) => (
  <button
    type="button"
    className={`cine-provider-card${active ? ' active' : ''}`}
    style={{ '--provider-color': color } as React.CSSProperties}
    aria-pressed={active}
    aria-label={label}
    onClick={() => onSelect(id)}
  >
    <div className="cine-provider-icon cine-provider-icon-dynamic" style={{ '--cine-provider-icon-color': color } as React.CSSProperties}>
      {icon}
    </div>
    <div className="cine-provider-info">
      <span className="cine-provider-label">{label}</span>
      <span className="cine-provider-desc">{desc}</span>
    </div>
  </button>
);

export default ProviderCard;
