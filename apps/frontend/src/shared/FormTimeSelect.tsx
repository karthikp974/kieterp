import { useEffect, useState } from "react";
import { FormSelect } from "./FormSelect";
import {
  joinTimeValue,
  parseTimeValue,
  TIME_HOUR_OPTIONS,
  TIME_MINUTE_OPTIONS
} from "./time-select";

type FormTimeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
};

/** Branded hour + minute dropdowns — 24-hour format (HH:mm). */
export function FormTimeSelect({
  value,
  onChange,
  disabled = false,
  required = false,
  className = "",
  "aria-label": ariaLabel = "Time"
}: FormTimeSelectProps) {
  const parsed = parseTimeValue(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  useEffect(() => {
    const next = parseTimeValue(value);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

  const hourOptions = required
    ? TIME_HOUR_OPTIONS
    : ([["", "Hour"], ...TIME_HOUR_OPTIONS] as readonly [string, string][]);
  const minuteOptionsBase =
    TIME_MINUTE_OPTIONS.some(([m]) => m === minute)
      ? TIME_MINUTE_OPTIONS
      : minute
        ? ([[minute, minute], ...TIME_MINUTE_OPTIONS] as readonly [string, string][])
        : ([["", "Min"], ...TIME_MINUTE_OPTIONS] as readonly [string, string][]);
  const minuteOptions = required ? minuteOptionsBase.filter(([m]) => m !== "") : minuteOptionsBase;

  function onHourChange(nextHour: string) {
    setHour(nextHour);
    if (required) {
      onChange(joinTimeValue(nextHour, minute));
      return;
    }
    onChange(joinTimeValue(nextHour, minute || "00"));
  }

  function onMinuteChange(nextMinute: string) {
    setMinute(nextMinute);
    if (required) {
      onChange(joinTimeValue(hour, nextMinute));
      return;
    }
    onChange(joinTimeValue(hour || "00", nextMinute));
  }

  return (
    <div className={`erp-time-select ${className}`.trim()} role="group" aria-label={ariaLabel}>
      <FormSelect
        aria-label={`${ariaLabel} hour`}
        disabled={disabled}
        required={required}
        options={hourOptions}
        value={hour}
        onChange={onHourChange}
      />
      <span className="erp-time-select__sep" aria-hidden>
        :
      </span>
      <FormSelect
        aria-label={`${ariaLabel} minute`}
        disabled={disabled}
        required={required}
        options={minuteOptions}
        value={minute}
        onChange={onMinuteChange}
      />
    </div>
  );
}
