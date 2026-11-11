import { createEffect, on } from "solid-js";
import { jobVersion } from "../stores/jobs";

export function onJobUpdate(
  jobId: () => string | null | undefined,
  cb: () => void,
) {
  let prevId: string | null | undefined = jobId();
  let prevVersion = prevId ? jobVersion(prevId) : 0;

  createEffect(
    on(
      () => {
        const id = jobId();
        const ver = id ? jobVersion(id) : 0;
        return { id, ver };
      },
      ({ id, ver }) => {
        const sameJob = Boolean(id && id === prevId);
        const versionChanged = ver !== prevVersion;
        prevId = id;
        prevVersion = ver;
        if (sameJob && versionChanged) {
          cb();
        }
      },
      { defer: true },
    ),
  );
}

export const useJobUpdates = onJobUpdate;
