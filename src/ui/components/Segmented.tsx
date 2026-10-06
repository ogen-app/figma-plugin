import { useId } from 'preact/hooks'

export interface SegmentedProps<T extends string | number> {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean; title?: string }>
  onChange: (value: T) => void
  disabled?: boolean
}

export function Segmented<T extends string | number>({ label, value, options, onChange, disabled }: SegmentedProps<T>) {
  const labelId = useId()
  return (
    <div class="field">
      <span class="field-label" id={labelId}>
        {label}
      </span>
      <div class="segmented" role="radiogroup" aria-labelledby={labelId}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            class={o.value === value ? 'selected' : ''}
            disabled={disabled || o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
