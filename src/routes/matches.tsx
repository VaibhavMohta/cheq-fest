import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/matches')({
  component: lazyRouteComponent(() => import('./-matches')),
});
