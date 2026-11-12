import { createEffect, on } from "solid-js";
import { jobVersion, streamEpoch } from "../stores/jobs";

export function onJobUpdate(
  jobId: () => string | null | undefined,
  cb: () => void,
) {
  let prevId: string | null | undefined = jobId();
  let prevVersion = prevId ? jobVersion(prevId) : 0;
  let prevEpoch = streamEpoch();

  createEffect(
    on(
      () => {
        const id = jobId();
        const ver = id ? jobVersion(id) : 0;
        const epoch = streamEpoch();
        return { id, ver, epoch };
      },
      ({ id, ver, epoch }) => {
        const sameJob = Boolean(id && id === prevId);
        const versionOrEpochChanged =
          ver !== prevVersion || epoch !== prevEpoch;
        prevId = id;
        prevVersion = ver;
        prevEpoch = epoch;
        if (sameJob && versionOrEpochChanged) {
          cb();
        }
      },
      { defer: true },
    ),
  );
}

export const useJobUpdates = onJobUpdate;
