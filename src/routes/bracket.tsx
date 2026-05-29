import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/bracket')({
  component: lazyRouteComponent(() => import('./-bracket')),
});
