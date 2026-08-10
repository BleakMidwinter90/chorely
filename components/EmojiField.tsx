'use client';

import { useState } from 'react';

import { legendClass } from '@/components/formStyles';

interface EmojiFieldProps {
  name: string;
  options: readonly string[];
  defaultValue?: string;
  label: string;
}

/**
 * Pick an avatar or icon from a short list.
 *
 * A fixed set rather than a full emoji keyboard, and no image upload at all:
 * onboarding has to survive five housemates doing it on a phone in a kitchen,
 * and "choose and crop a profile photo" is where that stops happening.
 */
export function EmojiField({ name, options, defaultValue, label }: EmojiFieldProps) {
  const [selected, setSelected] = useState(defaultValue ?? options[0]);

  return (
    <fieldset>
      <legend className={legendClass}>{label}</legend>
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
              className={`grid size-10 cursor-pointer place-items-center rounded-xl text-lg leading-none transition-colors ${
                isSelected
                  ? 'bg-brand-soft ring-1 ring-brand/40'
                  : 'bg-sunk hover:bg-line/60'
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
