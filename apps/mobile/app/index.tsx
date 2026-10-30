import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '../src/state/AuthContext';

export default function Index() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  const consented =
    !!user?.consent?.terms?.accepted && !!user?.consent?.privacy?.accepted;
  if (!consented) return <Redirect href="/consent" />;

  return <Redirect href="/(tabs)" />;
}
