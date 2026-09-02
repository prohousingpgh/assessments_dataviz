import { useCallback, useId, useRef, type KeyboardEvent } from 'react'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
}

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const baseId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const focusTab = useCallback((index: number) => {
    const tab = tabRefs.current[index]
    tab?.focus()
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = options.length - 1
      let next: number | undefined

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = index === last ? 0 : index + 1
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          next = index === 0 ? last : index - 1
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = last
          break
        default:
          return
      }

      event.preventDefault()
      const nextValue = options[next]?.value
      if (nextValue != null) {
        onChange(nextValue)
        focusTab(next)
      }
    },
    [focusTab, onChange, options]
  )

  const classes = className
    ? `segmented-control ${className}`
    : 'segmented-control'

  return (
    <div role="tablist" aria-label={ariaLabel} className={classes}>
      {options.map((option, index) => {
        const selected = option.value === value
        const tabId = `${baseId}-tab-${option.value}`
        const panelId = `${baseId}-panel-${option.value}`

        return (
          <button
            key={option.value}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            type="button"
            role="tab"
            id={tabId}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className="segmented-control-tab"
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

type SegmentedPanelProps = {
  id: string
  labelledBy: string
  hidden?: boolean
  children: React.ReactNode
  className?: string
}

export function SegmentedPanel({
  id,
  labelledBy,
  hidden,
  children,
  className,
}: SegmentedPanelProps) {
  const classes = className
    ? `segmented-control-panel ${className}`
    : 'segmented-control-panel'

  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      hidden={hidden}
      className={classes}
    >
      {children}
    </div>
  )
}
