import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/arena')({
  component: lazyRouteComponent(() => import('./-arena')),
});
