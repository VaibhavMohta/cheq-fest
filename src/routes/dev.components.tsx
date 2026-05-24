import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/dev/components')({
  component: lazyRouteComponent(() => import('./-dev-components')),
});
