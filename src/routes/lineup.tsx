import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/lineup')({
  component: lazyRouteComponent(() => import('./-lineup')),
});
