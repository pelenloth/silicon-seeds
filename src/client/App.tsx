import { Navigate, Router, Route } from "@solidjs/router";
import { lazy, Suspense } from "solid-js";
import Layout from "./components/Layout";

const Jobs = lazy(() => import("./pages/Jobs"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Compose = lazy(() => import("./pages/Compose"));
const CreateImage = lazy(() => import("./pages/CreateImage"));
const CreateAudio = lazy(() => import("./pages/CreateAudio"));
const CreateVideo = lazy(() => import("./pages/CreateVideo"));
const CreateTextToVideo = lazy(() => import("./pages/CreateTextToVideo"));
const Settings = lazy(() => import("./pages/Settings"));
const DevKit = lazy(() => import("./pages/DevKit"));

export default function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={() => <Navigate href="/jobs" />} />
      <Route path="/dashboard" component={() => <Navigate href="/jobs" />} />
      <Route
        path="/jobs"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <Jobs />
          </Suspense>
        )}
      />

      <Route
        path="/jobs/:jobId"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <Jobs />
          </Suspense>
        )}
      />

      <Route
        path="/gallery"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <Gallery />
          </Suspense>
        )}
      />

      <Route
        path="/compose"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <Compose />
          </Suspense>
        )}
      />

      <Route
        path="/create/image"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <CreateImage />
          </Suspense>
        )}
      />

      <Route
        path="/create/audio"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <CreateAudio />
          </Suspense>
        )}
      />

      <Route
        path="/create/video"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <CreateVideo />
          </Suspense>
        )}
      />

      <Route
        path="/create/text-to-video"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <CreateTextToVideo />
          </Suspense>
        )}
      />

      <Route
        path="/settings"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <Settings />
          </Suspense>
        )}
      />

      <Route
        path="/dev/kit"
        component={() => (
          <Suspense
            fallback={
              <div class="flex justify-center py-16">
                <span class="loading loading-spinner" />
              </div>
            }
          >
            <DevKit />
          </Suspense>
        )}
      />
    </Router>
  );
}
