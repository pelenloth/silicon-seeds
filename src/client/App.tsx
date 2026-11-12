import { Navigate, Route, Router } from "@solidjs/router";
import { lazy, Suspense, type Component } from "solid-js";
import AppShell from "./components/shell/AppShell";

function lazyPage(loader: () => Promise<{ default: Component }>) {
  const Page = lazy(loader);
  return () => (
    <Suspense
      fallback={
        <div class="flex justify-center py-16">
          <span class="loading loading-spinner" />
        </div>
      }
    >
      <Page />
    </Suspense>
  );
}

const Home = lazyPage(() => import("./pages/Home"));
const Jobs = lazyPage(() => import("./pages/Jobs"));

export default function App() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={() => <Navigate href="/" />} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/jobs/:jobId" component={Jobs} />
      <Route
        path="/gallery"
        component={lazyPage(() => import("./pages/Gallery"))}
      />
      <Route
        path="/compose"
        component={lazyPage(() => import("./pages/Compose"))}
      />
      <Route
        path="/create/image"
        component={lazyPage(() => import("./pages/CreateImage"))}
      />
      <Route
        path="/create/audio"
        component={lazyPage(() => import("./pages/CreateAudio"))}
      />
      <Route
        path="/create/video"
        component={lazyPage(() => import("./pages/CreateVideo"))}
      />
      <Route
        path="/create/text-to-video"
        component={lazyPage(() => import("./pages/CreateTextToVideo"))}
      />
      <Route
        path="/settings"
        component={lazyPage(() => import("./pages/Settings"))}
      />
      <Route
        path="/dev/kit"
        component={lazyPage(() => import("./pages/DevKit"))}
      />
      <Route
        path="*404"
        component={lazyPage(() => import("./pages/NotFound"))}
      />
    </Router>
  );
}
