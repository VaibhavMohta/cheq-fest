import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/referee')({
  component: lazyRouteComponent(() => import('./-referee')),
});
