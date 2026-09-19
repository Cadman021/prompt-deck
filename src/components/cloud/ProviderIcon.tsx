// src/components/cloud/ProviderIcon.tsx
// Renders `/providers/<id>.png` (128×128, user-supplied) with an initials
// tile fallback when the file is missing.
import React, { useState } from 'react';
import type { CloudProviderDef } from '../../data/cloudProviders';

interface ProviderIconProps {
  def: Pick<CloudProviderDef, 'icon' | 'color' | 'initials' | 'name'>;
  size?: 'md' | 'lg';
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({ def, size = 'md' }) => {
  const [missing, setMissing] = useState(false);
  const cls = size === 'lg' ? 'w-11 h-11 text-base' : 'w-9 h-9 text-sm';

  if (def.icon && !missing) {
    return (
      <img
        src={def.icon}
        alt={def.name}
        width={size === 'lg' ? 44 : 36}
        height={size === 'lg' ? 44 : 36}
        onError={() => setMissing(true)}
        className={`${cls} rounded-lg object-cover shrink-0 bg-white dark:bg-white/10`}
      />
    );
  }
  return (
    <span
      className={`${cls} rounded-lg flex items-center justify-center font-bold text-white shrink-0`}
    >
      {def.initials}
    </span>
  );
};
