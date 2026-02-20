"use client";

import useLocalStorageState from "use-local-storage-state";

export type CreateOnboardingState = {
  firstRunCompleted: boolean;
  hintsDismissed: boolean;
  simpleRailPinned: boolean;
};

const STORAGE_KEY = "makecomics_create_onboarding";

const DEFAULT_ONBOARDING_STATE: CreateOnboardingState = {
  firstRunCompleted: false,
  hintsDismissed: false,
  simpleRailPinned: false,
};

export function useCreateOnboarding() {
  const [state, setState] = useLocalStorageState<CreateOnboardingState>(
    STORAGE_KEY,
    {
      defaultValue: DEFAULT_ONBOARDING_STATE,
    }
  );

  const safeState = state ?? DEFAULT_ONBOARDING_STATE;

  const patchState = (partial: Partial<CreateOnboardingState>) => {
    setState((current) => ({
      ...(current ?? DEFAULT_ONBOARDING_STATE),
      ...partial,
    }));
  };

  return {
    state: safeState,
    patchState,
    markFirstRunCompleted: () => patchState({ firstRunCompleted: true }),
    dismissHints: () => patchState({ hintsDismissed: true }),
    toggleSimpleRailPinned: () =>
      patchState({ simpleRailPinned: !safeState.simpleRailPinned }),
  };
}
