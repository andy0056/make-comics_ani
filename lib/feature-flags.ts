type FeatureFlagKey =
  | "canon_core"
  | "guardian"
  | "health_score"
  | "continuation_suggestions"
  | "missions"
  | "autopilot"
  | "twin"
  | "model_adapter"
  | "publishing"
  | "remix_graph"
  | "shared_universe"
  | "co_edit_live"
  | "co_creation_rooms"
  | "creator_economy"
  | "economy_orchestrator"
  | "economy_automation"
  | "economy_autorun"
  | "economy_policy_learning"
  | "economy_outcome_agent"
  | "economy_optimizer"
  | "economy_strategy_loop"
  | "economy_window_loop"
  | "economy_self_healing";

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

const FLAG_VALUES: Record<FeatureFlagKey, boolean> = {
  canon_core: parseBooleanEnv(process.env.FEATURE_CANON_CORE, true),
  guardian: parseBooleanEnv(process.env.FEATURE_GUARDIAN, true),
  health_score: parseBooleanEnv(process.env.FEATURE_HEALTH_SCORE, true),
  continuation_suggestions: parseBooleanEnv(
    process.env.FEATURE_CONTINUATION_SUGGESTIONS,
    true,
  ),
  missions: parseBooleanEnv(process.env.FEATURE_MISSIONS, true),
  autopilot: parseBooleanEnv(process.env.FEATURE_AUTOPILOT, true),
  twin: parseBooleanEnv(process.env.FEATURE_TWIN, true),
  model_adapter: parseBooleanEnv(process.env.FEATURE_MODEL_ADAPTER, true),
  publishing: parseBooleanEnv(process.env.FEATURE_PUBLISHING, true),
  remix_graph: parseBooleanEnv(process.env.FEATURE_REMIX_GRAPH, true),
  shared_universe: parseBooleanEnv(process.env.FEATURE_SHARED_UNIVERSE, true),
  co_edit_live: parseBooleanEnv(process.env.FEATURE_CO_EDIT_LIVE, true),
  co_creation_rooms: parseBooleanEnv(process.env.FEATURE_CO_CREATION_ROOMS, true),
  creator_economy: parseBooleanEnv(process.env.FEATURE_CREATOR_ECONOMY, true),
  economy_orchestrator: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_ORCHESTRATOR,
    true,
  ),
  economy_automation: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_AUTOMATION,
    true,
  ),
  economy_autorun: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_AUTORUN,
    true,
  ),
  economy_policy_learning: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_POLICY_LEARNING,
    true,
  ),
  economy_outcome_agent: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_OUTCOME_AGENT,
    true,
  ),
  economy_optimizer: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_OPTIMIZER,
    true,
  ),
  economy_strategy_loop: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_STRATEGY_LOOP,
    true,
  ),
  economy_window_loop: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_WINDOW_LOOP,
    true,
  ),
  economy_self_healing: parseBooleanEnv(
    process.env.FEATURE_ECONOMY_SELF_HEALING,
    true,
  ),
};

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FLAG_VALUES[flag];
}

export function getFeatureFlags(): Record<FeatureFlagKey, boolean> {
  return { ...FLAG_VALUES };
}
