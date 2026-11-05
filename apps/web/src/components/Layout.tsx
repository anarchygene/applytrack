import { NavLink, Outlet, useNavigate } from 'react-router';
import { useMe, useSignOut } from '../auth';
import { Button, cx } from './ui';

const NAV = [
  { to: '/applications', label: 'Applications' },
  { to: '/board', label: 'Board' },
  { to: '/reminders', label: 'Reminders' },
  { to: '/stats', label: 'Stats' },
  { to: '/settings', label: 'Settings' },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold text-slate-900">
      <img src="/favicon.svg" alt="" className="size-7" />
      ApplyTrack
    </span>
  );
}

export function Layout() {
  const { data: user } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      {user?.isDemo && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          You're exploring a private demo account. It and its data are deleted automatically
          after 24 hours.
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/applications">
            <Logo />
          </NavLink>
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cx(
                    'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm text-slate-500 hover:text-slate-800 md:inline"
            >
              API docs
            </a>
            <span className="hidden text-sm text-slate-600 sm:inline">{user?.name}</span>
            <Button
              variant="secondary"
              onClick={() => signOut.mutate(undefined, { onSettled: () => navigate('/login') })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
