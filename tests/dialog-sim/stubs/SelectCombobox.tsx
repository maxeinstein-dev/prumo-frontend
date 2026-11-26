// The real SelectCombobox is a Radix popover (portal + search box); the forecast simulation drives a native select with the same props.
interface Option { value: string; label: string }
interface Props { value: string; onValueChange: (value: string) => void; options: Option[]; placeholder?: string; disabled?: boolean }
const SelectCombobox = ({ value, onValueChange, options, disabled = false }: Props) => (
  <select data-testid="select-combobox" value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);
export default SelectCombobox;
