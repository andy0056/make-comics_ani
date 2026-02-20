"use client";

import useLocalStorageState from "use-local-storage-state";

export type UiMode = "simple" | "advanced";

const UI_MODE_STORAGE_KEY = "makecomics_ui_mode";

export function useUiMode(): [UiMode, (mode: UiMode) => void] {
  const [mode, setMode] = useLocalStorageState<UiMode>(UI_MODE_STORAGE_KEY, {
    defaultValue: "simple",
  });

  return [
    mode ?? "simple",
    (nextMode: UiMode) => {
      setMode(nextMode);
    },
  ];
}
