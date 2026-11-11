import { createEffect, on } from "solid-js";
import { jobVersion } from "../stores/jobs";

export function onJobUpdate(
  jobId: () => string | null | undefined,
  cb: () => void,
) {
  createEffect(
    on(
      () => {
        const id = jobId();
        return id ? `${id}:${jobVersion(id)}` : "";
      },
      (key) => {
        if (key) cb();
      },
      { defer: true },
    ),
  );
}

export const useJobUpdates = onJobUpdate;
