export type EnhanceChainState = {
  origin: string | null;
  lastResult: string | null;
};

export const INITIAL_ENHANCE_CHAIN: EnhanceChainState = {
  origin: null,
  lastResult: null,
};

export type EnhanceChainAction =
  | { type: "enhance-result"; sentOrigin: string; resultText: string }
  | { type: "undo" }
  | { type: "user-input"; value: string }
  | { type: "sync-value"; value: string };

export function enhanceSourceText(
  state: EnhanceChainState,
  currentValue: string,
): string {
  return state.origin ?? currentValue;
}

export function enhanceChainReducer(
  state: EnhanceChainState,
  action: EnhanceChainAction,
): EnhanceChainState {
  switch (action.type) {
    case "enhance-result":
      return {
        origin: state.origin ?? action.sentOrigin,
        lastResult: action.resultText,
      };
    case "undo":
    case "user-input":
      return INITIAL_ENHANCE_CHAIN;
    case "sync-value":
      if (state.origin === null) {
        return state;
      }
      if (action.value === state.lastResult) {
        return state;
      }
      return INITIAL_ENHANCE_CHAIN;
  }
}
