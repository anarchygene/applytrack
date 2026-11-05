import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ApiError } from './api/client';
import { ME_KEY, RequireAuth } from './auth';
import { Layout } from './components/Layout';
import './index.css';
import { ApplicationDetailPage } from './pages/ApplicationDetail';
import { ApplicationsPage } from './pages/Applications';
import { BoardPage } from './pages/Board';
import { LoginPage } from './pages/Login';
import { RemindersPage } from './pages/Reminders';
import { SettingsPage } from './pages/Settings';
import { StatsPage } from './pages/Stats';

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    // An expired session anywhere sends the user back to sign-in.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(ME_KEY, null);
    },
  }),
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/applications" replace /> },
          { path: '/applications', element: <ApplicationsPage /> },
          { path: '/applications/:id', element: <ApplicationDetailPage /> },
          { path: '/board', element: <BoardPage /> },
          { path: '/reminders', element: <RemindersPage /> },
          { path: '/stats', element: <StatsPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/applications" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
