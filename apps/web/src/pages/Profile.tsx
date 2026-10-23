import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { useFeed } from '../state/FeedContext';
import { useMessaging } from '../state/MessagingContext';
import type { FeedPost } from '../state/FeedContext';
import PostCard from '../components/PostCard';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';

interface ProfileData {
  username: string;
  email: string;
  bio: string;
  avatar: string;
  avatar_url?: string;
  subject_expertise: string;
  post_count: number;
  followers_count: number;
  following_count: number;
  badge_count: number;
  badges: { code: string; name: string; description: string; icon: string; awarded_at: string }[];
  created_at: string;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center" style={{ flex: 1, minWidth: 70 }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-ink)' }}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, updateProfile } = useAuth();
  const { startConversation } = useMessaging();
  const { toggleFollow, followStatus, loadFeed } = useFeed();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingMessage, setStartingMessage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState('');
  const [followSeeded, setFollowSeeded] = useState(false);
  const requestRef = useRef(0);

  const isMe = user?.username === username;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    // Navigation between two profiles reuses this component; never let the
    // previous member's follow state leak into the new profile.
    setFollowSeeded(false);
    const [profileData, postData] = await Promise.all([
      apiFetch<ProfileData>(`/auth/profiles/${username}/`),
      apiFetch<{ results: FeedPost[] }>(`/posts/?author=${encodeURIComponent(username || '')}`),
    ]);
    if (requestId !== requestRef.current) return;
    setProfile(profileData);
    setPosts(postData?.results || []);
    if (profileData && !isMe) {
      const status = await apiFetch<{ following: boolean }>(`/auth/profiles/${username}/is-following/`);
      if (requestId !== requestRef.current) return;
      if (status) setFollowSeeded(status.following);
    }
    setLoading(false);
  }, [username, isMe]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <CuriousLoading message="Loading profile…" />;
  if (!profile) return <CuriousEmpty title="Profile not found" description="This member may have been deactivated." />;

  const following = isMe ? false : (followStatus(username || '') ?? followSeeded);

  const startEdit = () => {
    setBio(profile.bio);
    setExpertise(profile.subject_expertise);
    setEditing(true);
  };

  const saveEdit = async () => {
    await updateProfile({ bio, subject_expertise: expertise });
    setEditing(false);
    await load();
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="comment-corner-card" style={{ padding: '1.4rem 1.5rem', marginBottom: '1.25rem' }}>
        <div className="flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '4px 0 4px 4px',
              background: 'var(--color-teal)',
              color: '#14141A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.5rem',
              flexShrink: 0,
              backgroundImage: (profile.avatar_url || profile.avatar) ? `url(${profile.avatar_url || profile.avatar})` : undefined,
              backgroundSize: 'cover',
            }}
          >
            {!profile.avatar && profile.username[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{profile.username}</h2>
            {profile.subject_expertise && (
              <div className="badge-tag badge-teal" style={{ marginTop: '0.3rem' }}>
                helps with {profile.subject_expertise}
              </div>
            )}
            <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.55 }}>
              {profile.bio || 'This member hasn’t written a bio yet.'}
            </p>
          </div>
          {isAuthenticated && !isMe && (
            <div className="profile-header-actions">
              <button
                className="btn btn-secondary"
                style={{ padding: '0.45rem 1.2rem' }}
                disabled={startingMessage}
                onClick={async () => {
                  setStartingMessage(true);
                  const conversationId = await startConversation(profile.username);
                  setStartingMessage(false);
                  if (conversationId) navigate(`/messages/${conversationId}`);
                }}
              >
                <i className="bx bx-message-rounded-dots"></i>{' '}
                {startingMessage ? 'Opening…' : 'Message'}
              </button>
              <button
                className={`btn ${following ? 'btn-secondary' : 'btn-primary'}`}
                style={{ padding: '0.45rem 1.2rem' }}
                onClick={async () => {
                  const nowFollowing = await toggleFollow(profile.username, following);
                  setFollowSeeded(nowFollowing);
                  if (nowFollowing) await loadFeed('following', 1);
                }}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            </div>
          )}
          {isMe && !editing && (
            <button className="btn btn-secondary" style={{ padding: '0.45rem 1.2rem' }} onClick={startEdit}>
              <i className="bx bx-edit"></i> Edit profile
            </button>
          )}
        </div>

        {editing && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1.5px solid var(--color-line)' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Bio</label>
            <textarea
              rows={3}
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={500}
              style={{ width: '100%', marginBottom: '0.6rem' }}
              placeholder="What do you enjoy teaching or researching?"
            />
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Helps with (expertise)
            </label>
            <input
              value={expertise}
              onChange={e => setExpertise(e.target.value)}
              placeholder="e.g. Algebra, Essay writing, Machine learning"
              style={{ width: '100%', marginBottom: '0.8rem' }}
            />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => void saveEdit()}>Save</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="flex gap-2" style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: '1.5px solid var(--color-line)' }}>
          <Stat label="Posts" value={profile.post_count} />
          <Stat label="Followers" value={profile.followers_count} />
          <Stat label="Following" value={profile.following_count} />
          <Stat label="Badges" value={profile.badge_count} />
        </div>
      </div>

      <section style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          <HighlighterText color="#F4B43D">Badges</HighlighterText>
        </h3>
        {profile.badges.length === 0 ? (
          <p className="text-sm text-muted">No badges yet — teach an answer, solve a problem, or collaborate on research.</p>
        ) : (
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {profile.badges.map(badge => (
              <div
                key={badge.code}
                className="comment-corner-card"
                title={badge.description}
                style={{ padding: '0.55rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: 0 }}
              >
                <i className="bx bx-award" style={{ color: 'var(--color-mustard)', fontSize: '1.1rem' }}></i>
                <div>
                  <div className="font-semibold text-sm">{badge.name}</div>
                  <div className="text-xs text-muted" style={{ maxWidth: 260 }}>{badge.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          <HighlighterText color="#00A896">Posts</HighlighterText>
        </h3>
        {posts.length === 0 ? (
          <CuriousEmpty title="No posts yet" description={`${profile.username} hasn’t shared anything publicly.`} />
        ) : (
          posts.map(post => <PostCard key={post.id} post={post} />)
        )}
        <div className="text-center mt-4">
          <Link to="/feed" className="text-sm text-muted" style={{ textDecoration: 'none' }}>
            <i className="bx bx-left-arrow-alt"></i> Back to feed
          </Link>
        </div>
      </section>
    </div>
  );
}
