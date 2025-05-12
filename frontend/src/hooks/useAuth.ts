'use client';
import { useAuthenticator } from '@aws-amplify/ui-react';

/**
 * Hook exposing the current authenticated user and signOut function.
 */
export function useAuth() {
  const { user, signOut } = useAuthenticator((context) => [
    context.user,
    context.signOut,
  ]);
  return { user, signOut };
} 