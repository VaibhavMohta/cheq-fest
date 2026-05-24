import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { TabBar } from '@/components/shared/TabBar';

export const Route = createRootRoute({
  component: RootLayout,
});

const HIDE_TABBAR_ON: readonly string[] = ['/login'];

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showTabBar = !HIDE_TABBAR_ON.includes(pathname);

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[420px] bg-bg text-ink">
      <Outlet />
      {showTabBar && <TabBar />}
    </div>
  );
}
