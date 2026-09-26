"use client";

import { useEffect, useState } from "react";

/** Light is the default. Dark is a preference, not the starting point. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("amber-theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
    setDark(next);
  }

  return (
    <button type="button" onClick={toggle} className="text-[13px] text-ink-3 hover:text-ink">
      {dark ? "Light" : "Dark"}
    </button>
  );
}
