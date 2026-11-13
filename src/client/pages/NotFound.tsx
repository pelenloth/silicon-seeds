import { A } from "@solidjs/router";
import { EmptyState } from "../components/ui/EmptyState";

export default function NotFound() {
  return (
    <div class="page">
      <EmptyState
        title="Page not found"
        description="That page does not exist."
        action={
          <A href="/" class="btn btn-primary btn-sm">
            Go home
          </A>
        }
      />
    </div>
  );
}
