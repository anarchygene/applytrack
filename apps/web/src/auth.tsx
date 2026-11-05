import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router';
import { api, ApiError, unwrap, type User } from './api/client';
import { Spinner } from './components/ui';

export const ME_KEY = ['me'] as const;

/** The signed-in user, or `null` when there is no valid session. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        return await unwrap(api.GET('/v1/me'));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/v1/auth/logout')),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
    },
  });
}

/** Called after login/register/demo: seed the cache and drop anything from a previous user. */
export function useSignedIn() {
  const queryClient = useQueryClient();
  return (user: User) => {
    queryClient.clear();
    queryClient.setQueryData(ME_KEY, user);
  };
}

export function RequireAuth() {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
