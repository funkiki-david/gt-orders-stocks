type FormFieldProps = {
  label: string;
  value: string | number;
  onChange?: (value: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  list?: string;
};

export function FormField({ label, value, onChange, type = 'text', multiline = false, placeholder, list }: FormFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-primaryText">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          className="min-h-[72px] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primaryText"
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          className="h-[34px] w-full rounded-md border border-border bg-white px-3 text-sm text-primaryText"
        />
      )}
    </label>
  );
}
