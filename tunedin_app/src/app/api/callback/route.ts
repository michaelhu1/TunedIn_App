import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: code || '',
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();
  const access_token = tokenData.access_token;

  // Redirect to dashboard or profile with token in query (or use cookies)
  return NextResponse.redirect(
    `http://localhost:3000/dashboard?access_token=${access_token}`
  );
  
}