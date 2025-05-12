"use client";
import { Amplify } from 'aws-amplify';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import awsConfig from '../lib/aws-exports';
import '@aws-amplify/ui-react/styles.css';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthSession } from '@aws-amplify/core';
import type { AuthSession } from '@aws-amplify/core';
import { UserProfileProvider } from '../context/UserProfileContext';
import ProfileCompletionModals from './profile/ProfileCompletionModals';

// Configure Amplify only in browser
if (typeof window !== 'undefined') {
  // suppress TS mismatch between aws-exports and Amplify.configure signature
  // @ts-expect-error: awsConfig type mismatch
  Amplify.configure(awsConfig);
}

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  return (
    <Authenticator>
      <ProtectedLayout>{children}</ProtectedLayout>
    </Authenticator>
  );
}

function ProtectedLayout({ children }: AuthWrapperProps) {
  const { user, signOut } = useAuthenticator();
  const router = useRouter();
  const [groups, setGroups] = useState<string[]>([]);
  const [isPostSignUpProcessing, setIsPostSignUpProcessing] = useState(false);
  const [postSignUpError, setPostSignUpError] = useState<string | null>(null);

  // Effect to fetch user groups for navigation links
  useEffect(() => {
    if (!user) return;
    fetchAuthSession()
      .then((session: AuthSession) => {
        const idToken = session.tokens?.idToken;
        const payload = idToken?.payload ?? {};
        const fetchedGroups = Array.isArray(payload['cognito:groups'])
          ? (payload['cognito:groups'] as string[])
          : [];
        setGroups(fetchedGroups);
      })
      .catch((err: unknown) => console.error('Session fetch error for groups', err));
  }, [user]);

  // New effect for post-sign-up actions
  useEffect(() => {
    if (user && user.username && typeof window !== 'undefined') {
      const cognitoUsername = user.username;
      const flagKey = `postSignUpCallDoneForUser_${cognitoUsername}`;

      if (!localStorage.getItem(flagKey)) {
        setIsPostSignUpProcessing(true);
        setPostSignUpError(null);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) {
            console.error("NEXT_PUBLIC_API_URL is not set. Cannot perform post-sign-up action.");
            setPostSignUpError("Configuration error. Please contact support.");
            setIsPostSignUpProcessing(false);
            return;
        }

        // Fetch the session to get the ID token
        fetchAuthSession()
          .then(session => {
            const idToken = session.tokens?.idToken?.toString();
            if (!idToken) {
              console.error('Post-sign-up: ID token not found. Cannot make authenticated call.');
              throw new Error('ID token not found');
            }

            console.log(`Performing post-sign-up actions for ${cognitoUsername} with token.`);
            return fetch(`${apiUrl}/api/users/post-signup/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
              },
            });
          })
          .then(async response => {
            const responseBody = await response.json().catch(() => ({}));
            if (response.ok) {
              return responseBody;
            }
            throw { 
              status: response.status, 
              message: responseBody.message || `Request failed with status ${response.status}` 
            };
          })
          .then(data => {
            if (data.status === 'success') {
              localStorage.setItem(flagKey, 'true');
              const userGroups = data.cognito_groups || []; // Get groups from response

              if (data.action_taken === 'default_group_assigned') {
                console.log(`Post-sign-up: User ${cognitoUsername} was newly assigned the default client group. Navigating to /client.`);
                router.replace('/client'); 
              } else {
                console.log(`Post-sign-up: User ${cognitoUsername} role verified (${data.action_taken}). Sync complete. Determining navigation based on groups: ${userGroups.join(', ')}`);
                if (userGroups.includes(process.env.NEXT_PUBLIC_COGNITO_ADMINS_GROUP_NAME || 'admins')) {
                  router.replace('/admin');
                } else if (userGroups.includes(process.env.NEXT_PUBLIC_COGNITO_LAWYERS_GROUP_NAME || 'lawyers')) {
                  router.replace('/lawyer');
                } else if (userGroups.includes(process.env.NEXT_PUBLIC_COGNITO_CLIENTS_GROUP_NAME || 'clients')) {
                  router.replace('/client');
                } else {
                  // Fallback if groups are empty or don't match, though 'clients' should be the default assigned one
                  console.warn("Post-sign-up: User has no recognizable primary group after sync, defaulting to /client for safety.");
                  router.replace('/client'); 
                }
              }
            } else {
              console.error(`Post-sign-up actions indicated failure for ${cognitoUsername}: ${data.message || 'No specific error message from server.'}`);
              setPostSignUpError(data.message || "An unexpected error occurred during account finalization. Please try signing out and in again.");
            }
          })
          .catch(error => {
            if (error.message !== 'ID token not found') {
                 console.error(`Error during post-sign-up API call for ${cognitoUsername}:`, error.message || error);
                 setPostSignUpError(error.message || "Failed to finalize your account. Please try signing out and in again, or contact support.");
            }
          })
          .finally(() => {
            setIsPostSignUpProcessing(false);
          });
      }
    }
  }, [user, router]);

  if (isPostSignUpProcessing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Finalizing your session, please wait...</p>
      </div>
    );
  }

  if (postSignUpError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px', textAlign: 'center' }}>
        <h2>Account Setup Issue</h2>
        <p style={{color: 'red', margin: '20px 0'}}>{postSignUpError}</p>
        <p>Please try signing out and signing back in. If the problem persists, contact support.</p>
        <button 
          onClick={() => {
            signOut();
            router.replace('/');
          }} 
          style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <UserProfileProvider>
      <>
        <header className="flex justify-between items-center p-4 bg-gray-100">
          <span>Signed in as {user?.username}</span>
          <div className="space-x-4">
            {groups.includes('clients') && (
              <Link href="/client" className="px-3 py-1 bg-blue-600 text-white rounded">
                Client
              </Link>
            )}
            {groups.includes('lawyers') && (
              <Link href="/lawyer" className="px-3 py-1 bg-blue-600 text-white rounded">
                Lawyer
              </Link>
            )}
            {groups.includes('admins') && (
              <Link href="/admin" className="px-3 py-1 bg-blue-600 text-white rounded">
                Admin
              </Link>
            )}
            <button onClick={signOut} className="px-3 py-1 bg-red-500 text-white rounded">
              Sign Out
            </button>
          </div>
        </header>
        {children}
        <ProfileCompletionModals />
      </>
    </UserProfileProvider>
  );
} 