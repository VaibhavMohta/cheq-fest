import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/rosters')({
  component: lazyRouteComponent(() => import('./-rosters')),
});
