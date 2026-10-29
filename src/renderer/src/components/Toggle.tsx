interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}

export function Toggle({ checked, onChange, disabled, label }: Props): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="switch disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="switch-knob" />
    </button>
  )
}
