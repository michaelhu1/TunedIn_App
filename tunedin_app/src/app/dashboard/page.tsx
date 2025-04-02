'use client';

import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');

    if (!token) {
      setError('Missing access token');
      return;
    }

    const fetchProfile = async () => {
      try {
        const res = await fetch('https://api.spotify.com/v1/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error('Failed to fetch profile');
        const data = await res.json();
        setProfile(data);
      } catch (err: any) {
        setError(err.message || 'Error fetching profile');
      }
    };

    fetchProfile();
  }, []);

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  if (!profile) {
    return <div className="p-4">Loading your Spotify profile...</div>;
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🎵 Welcome, {profile.display_name}</h1>
      {profile.images?.[0]?.url && (
        <img
          src={profile.images[0].url}
          alt="Profile picture"
          className="w-32 h-32 rounded-full mb-4"
        />
      )}
      <p><strong>Email:</strong> {profile.email}</p>
      <p><strong>Country:</strong> {profile.country}</p>
      <p><strong>Spotify ID:</strong> {profile.id}</p>
      <a
        href={profile.external_urls.spotify}
        target="_blank"
        className="text-green-600 underline mt-2 inline-block"
      >
        Open Spotify Profile
      </a>
    </div>
  );
}