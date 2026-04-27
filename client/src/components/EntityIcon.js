import React, { useEffect, useState } from 'react';
import { Box, Skeleton } from '@mui/material';
import {
  fetchEntityLogo,
  getEntityLogoSignedUrl,
} from '../hooks/useEntityLogos';

const SIZE_MAP = { sm: 36, md: 48, lg: 64 };

function resolveSize(size) {
  if (typeof size === 'number') return size;
  return SIZE_MAP[size] ?? SIZE_MAP.md;
}

/**
 * Rendert die Icon-Box für eine Entity (Asset, Schuld, Freistellungsauftrag).
 * Wenn `logoId` gesetzt ist und das User-Logo geladen werden konnte: das
 * Logo-Bild. Sonst: das Material-Symbol-Fallback in derselben Box.
 *
 * Props:
 *   logoId            UUID aus entity_logos oder null/undefined
 *   fallbackIconName  Material-Symbol-Name (z. B. "account_balance")
 *   size              "sm" | "md" | "lg" oder eine Zahl in px (default: "md")
 *   bgcolor           sx-Color-Token für die Box (default: "surface.highest")
 *   color             sx-Color-Token für das Fallback-Symbol
 *   borderRadius      sx-Wert (default: "12px")
 */
export default function EntityIcon({
  logoId,
  fallbackIconName,
  size = 'md',
  bgcolor = 'surface.highest',
  color = 'text.primary',
  borderRadius = '12px',
  sx,
}) {
  const px = resolveSize(size);
  const [imgUrl, setImgUrl] = useState(null);
  const [phase, setPhase]   = useState(logoId ? 'loading' : 'idle');

  useEffect(() => {
    let cancelled = false;
    if (!logoId) {
      setImgUrl(null);
      setPhase('idle');
      return undefined;
    }
    setPhase('loading');
    setImgUrl(null);
    (async () => {
      try {
        const row = await fetchEntityLogo(logoId);
        if (cancelled) return;
        if (!row?.image_path) { setPhase('error'); return; }
        const url = await getEntityLogoSignedUrl(row.image_path);
        if (cancelled) return;
        if (!url) { setPhase('error'); return; }
        setImgUrl(url);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [logoId]);

  const boxSx = {
    width: px, height: px,
    borderRadius,
    bgcolor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    ...sx,
  };

  if (logoId && phase === 'loading') {
    return (
      <Box sx={boxSx}>
        <Skeleton variant="rounded" width={px - 8} height={px - 8} />
      </Box>
    );
  }

  if (logoId && phase === 'ready' && imgUrl) {
    return (
      <Box sx={boxSx}>
        <Box
          component="img"
          src={imgUrl}
          alt=""
          onError={() => setPhase('error')}
          sx={{
            width: '100%', height: '100%',
            objectFit: 'contain',
            // Logo soll Luft zur Box-Kante haben — Padding via inset
            p: 0.75,
          }}
        />
      </Box>
    );
  }

  // Fallback: Material Symbol
  return (
    <Box sx={boxSx}>
      <Box
        component="span"
        className="material-symbols-outlined"
        sx={{ fontSize: Math.round(px * 0.5), color }}
      >
        {fallbackIconName}
      </Box>
    </Box>
  );
}
