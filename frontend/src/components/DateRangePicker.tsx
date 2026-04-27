"use client";

import { DateRangePickerValue } from "@tremor/react";

type GlobalDateRangePickerProps = {
  value: DateRangePickerValue;
  onValueChange: (value: DateRangePickerValue) => void;
};

function toInputDate(value?: Date) {
  if (!value) {
    return "";
  }

  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromInputDate(value: string) {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}T00:00:00`);
}

export default function GlobalDateRangePicker({
  value,
  onValueChange,
}: GlobalDateRangePickerProps) {
  const fromValue = toInputDate(value?.from);
  const toValue = toInputDate(value?.to);

  return (
    <div className="soft-toolbar flex w-full flex-wrap items-end gap-2 rounded-2xl px-3 py-3">
      <label className="min-w-[112px] flex-1">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b886f]">
          From
        </span>
        <input
          type="date"
          value={fromValue}
          onChange={(event) =>
            onValueChange({
              from: fromInputDate(event.target.value),
              to: value?.to,
            })
          }
          className="w-full rounded-xl border border-[#d9cdbd] bg-white px-3 py-2 text-sm text-[#2f261f] outline-none transition-colors focus:border-[#b89458]"
        />
      </label>

      <label className="min-w-[112px] flex-1">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b886f]">
          To
        </span>
        <input
          type="date"
          value={toValue}
          onChange={(event) =>
            onValueChange({
              from: value?.from,
              to: fromInputDate(event.target.value),
            })
          }
          className="w-full rounded-xl border border-[#d9cdbd] bg-white px-3 py-2 text-sm text-[#2f261f] outline-none transition-colors focus:border-[#b89458]"
        />
      </label>

      <button
        type="button"
        onClick={() => onValueChange({ from: undefined, to: undefined })}
        className="rounded-xl border border-[#d9cdbd] bg-white px-3 py-2 text-sm font-medium text-[#5e5144] transition-colors hover:bg-[#f7f1e7]"
      >
        Clear
      </button>
    </div>
  );
}
