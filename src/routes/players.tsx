import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/players')({
  component: lazyRouteComponent(() => import('./-players')),
});
