// A small brand-coloured mark per social platform, keyed by the platform's
// display name from the API. Unknown platforms get a neutral initial.
const BRANDS: Record<string, { mark: string; bg: string }> = {
  facebook: { mark: 'f', bg: '#1877f2' },
  instagram: { mark: 'IG', bg: '#e1306c' },
  linkedin: { mark: 'in', bg: '#0a66c2' },
  threads: { mark: '@', bg: '#000000' },
  'x (twitter)': { mark: 'X', bg: '#000000' },
  x: { mark: 'X', bg: '#000000' },
  youtube: { mark: '▶', bg: '#ff0000' },
  tiktok: { mark: '♪', bg: '#000000' },
  pinterest: { mark: 'P', bg: '#e60023' },
  bluesky: { mark: '🦋', bg: '#0085ff' },
}

export function PlatformBadge({ name }: { name: string | undefined }) {
  const label = name || 'No platform'
  const brand = name ? BRANDS[name.toLowerCase()] : undefined
  return (
    <span
      class={`platform-badge${brand ? '' : ' unknown'}`}
      style={brand ? { background: brand.bg } : undefined}
      title={label}
      aria-label={label}
      role="img"
    >
      {brand?.mark ?? (name ? name[0]!.toUpperCase() : '–')}
    </span>
  )
}
