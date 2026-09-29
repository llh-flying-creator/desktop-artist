/** 开关控件 */
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
}

export function Switch({ checked, onChange, disabled, title }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      title={title}
      className="switch"
      data-on={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
    />
  );
}
