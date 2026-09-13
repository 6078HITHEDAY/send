export function Selectbox({
  id,
  selected,
  options,
  label,
  onChange
}: {
  id: string;
  selected: number;
  options: number[];
  label: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <select
      id={id}
      className="appearance-none cursor-pointer border-default rounded-default bg-grey-10 hover:border-primary focus:border-primary pl-1 pr-8 py-1 my-1 h-8 dark:bg-grey-80"
      value={selected}
      onChange={event => onChange(Number.parseInt(event.target.value, 10))}
    >
      {options.map(value => (
        <option key={value} value={value}>
          {label(value)}
        </option>
      ))}
    </select>
  );
}
