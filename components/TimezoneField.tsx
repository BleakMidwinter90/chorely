'use client';

import { useEffect, useRef } from 'react';

/**
 * Captures the browser's IANA timezone into a hidden field.
 *
 * A household in Auckland and a server in Virginia must agree on which day it
 * is, and the household has to win — otherwise chores tick over to "due" in the
 * middle of someone's afternoon.
 *
 * The value is written straight to the DOM node rather than held in React
 * state. The timezone is only read when the form is submitted, so routing it
 * through a render would buy nothing and would mismatch hydration: the server
 * cannot know the browser's zone, so its markup would always disagree.
 */
export function TimezoneField({ name = 'timezone' }: { name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && inputRef.current) inputRef.current.value = resolved;
  }, []);

  // UTC is the fallback if the browser will not say.
  return <input ref={inputRef} type="hidden" name={name} defaultValue="UTC" />;
}
