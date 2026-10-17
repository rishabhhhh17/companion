import { useSyncExternalStore } from "react";
import { keysNow, onKeys, type Keys } from "./keys.ts";

/** The keys every job uses now (keys.ts); a component that reads them draws again when they change. */
export const useKeys = (): Keys => useSyncExternalStore(onKeys, keysNow);
