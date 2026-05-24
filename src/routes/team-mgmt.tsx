import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/team-mgmt')({
  component: lazyRouteComponent(() => import('./-team-mgmt')),
});
