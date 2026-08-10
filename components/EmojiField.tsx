'use client';

import { useState } from 'react';

interface EmojiFieldProps {
  name: string;
  options: readonly string[];
  defaultValue?: string;
  label: string;
}

/**
 * Pick an avatar or icon from a short list.
 *
 * A fixed list rather than a full emoji keyboard, and no image upload at all:
 * onboarding has to survive five housemates doing it on a phone in a kitchen,
 * and "choose and crop a profile photo" is where that stops happening.
 */
export function EmojiField({ name, options, defaultValue, label }: EmojiFieldProps) {
  const [selected, setSelected] = useState(defaultValue ?? options[0]);

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink-muted">{label}</legend>
      <input type="hidden" name={name} value={selected} />
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isSelected = option === selected;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setSelected(option)}
              aria-pressed={isSelected}
              aria-label={option}
              className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-xl transition ${
                isSelected
                  ? 'bg-accent-soft ring-2 ring-accent'
                  : 'bg-surface-sunk hover:brightness-95'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export const AVATAR_EMOJI = [
  '🙂', '😎', '🦊', '🐢', '🐙', '🦉', '🐝', '🐸', '🦔', '🐼', '🦄', '👾',
] as const;

export const CHORE_EMOJI = [
  '🧹', '🧽', '🍽️', '🗑️', '🚿', '🧺', '🛏️', '🪴', '🛒', '🧴', '🐕', '🚗',
  '🪟', '🧊', '📦', '💡',
] as const;
