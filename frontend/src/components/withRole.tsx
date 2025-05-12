'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthSession } from '@aws-amplify/core';
import type { AuthSession } from '@aws-amplify/core';

export default function withRole<P>(
  WrappedComponent: React.ComponentType<P>,
  allowedRoles: string[]
) {
  return function ProtectedComponent(props: P) {
    const router = useRouter();
    const [authorized, setAuthorized] = useState<boolean | null>(null);

    useEffect(() => {
      fetchAuthSession()
        .then((session: AuthSession) => {
          const payload = session.tokens?.idToken?.payload ?? {};
          const groups = Array.isArray(payload['cognito:groups'])
            ? (payload['cognito:groups'] as string[])
            : [];
          const hasRole = allowedRoles.some(role => groups.includes(role));
          setAuthorized(hasRole);
          if (!hasRole) {
            let redirectTo = '/';
            if (groups.includes('admins')) redirectTo = '/admin';
            else if (groups.includes('lawyers')) redirectTo = '/lawyer';
            else if (groups.includes('clients')) redirectTo = '/client';
            router.replace(redirectTo);
          }
        })
        .catch((err: unknown) => {
          console.error('Session fetch error', err);
          router.replace('/');
        });
    }, [router]);

    // while determining authorization, render nothing (or a loader if desired)
    if (authorized === null) {
      return null;
    }
    // if not authorized, content already redirected; do not render
    if (!authorized) {
      return null;
    }
    // authorized: render wrapped component
    // @ts-expect-error: pass through component props
    return <WrappedComponent {...props} />;
  };
} 