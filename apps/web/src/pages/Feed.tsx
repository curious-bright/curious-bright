import { useEffect, useState } from 'react';
import { useFeed } from '../state/FeedContext';
import { useAuth } from '../state/AuthContext';
import PostCard from '../components/PostCard';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';

const SUBJECTS = ['math', 'science', 'programming', 'language', 'research', 'general'];
const KINDS = ['question', 'explanation', 'note'];

function Composer() {
  const { addPost, loadFeed, tab } = useFeed();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('math');
  const [kind, setKind] = useState('question');
  const [latex, setLatex] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
        <span>Sign in to share what you know or ask the community.</span>
      </div>
    );
  }

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    const equations = latex.trim() ? [{ latex: latex.trim() }] : [];
    const created = await addPost({
      title: title.trim(),
      body: body.trim(),
      subject,
      kind,
      equations: equations.length ? equations : undefined,
    });
    setSubmitting(false);
    if (created) {
      setTitle('');
      setBody('');
      setLatex('');
      setOpen(false);
      await loadFeed(tab, 1);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-primary w-full" style={{ marginBottom: '1.25rem' }} onClick={() => setOpen(true)}>
        <i className="bx bx-pencil"></i> Share a thought, question or explanation
      </button>
    );
  }

  return (
    <div className="comment-corner-card" style={{ padding: '1.1rem 1.2rem', marginBottom: '1.25rem' }}>
      <div className="flex gap-2" style={{ marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {KINDS.map(k => (
          <button
            key={k}
            className={`btn ${kind === k ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {SUBJECTS.map(s => (
          <button
            key={s}
            className={`btn ${subject === s ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
            onClick={() => setSubject(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <input
        placeholder="Title — e.g. Why is 0.999… equal to 1?"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ marginBottom: '0.6rem' }}
      />
      <textarea
        placeholder="Explain it in your own words. Mention people with @username."
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={4}
        style={{ marginBottom: '0.6rem', width: '100%', resize: 'vertical' }}
      />
      <input
        placeholder="Optional equation (e.g. LaTeX / plain maths): 0.999… = 1"
        value={latex}
        onChange={e => setLatex(e.target.value)}
        style={{ marginBottom: '0.8rem', fontFamily: "'Courier New', monospace" }}
      />
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => void submit()} disabled={submitting || !title.trim() || !body.trim()}>
          {submitting ? 'Posting…' : 'Post to community'}
        </button>
        <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export default function Feed() {
  const { tab, posts, loading, hasMore, setTab, loadFeed, loadMore } = useFeed();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    void loadFeed(tab, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="text-center" style={{ marginBottom: '1.25rem' }}>
        <h2>
          <HighlighterText color="#00A896">Community Feed</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          Students teaching students — share knowledge, ask questions, collaborate on research.
        </p>
      </div>

      <div className="flex gap-2" style={{ marginBottom: '1rem', justifyContent: 'center' }}>
        <button
          className={`btn ${tab === 'discover' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('discover')}
          style={{ padding: '0.45rem 1.1rem', fontSize: '0.8rem' }}
        >
          <i className="bx bx-compass"></i> Discover
        </button>
        <button
          className={`btn ${tab === 'following' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('following')}
          disabled={!isAuthenticated}
          style={{ padding: '0.45rem 1.1rem', fontSize: '0.8rem' }}
        >
          <i className="bx bx-user-check"></i> Following
        </button>
      </div>

      <Composer />

      {loading && posts.length === 0 ? (
        <CuriousLoading />
      ) : posts.length === 0 ? (
        <CuriousEmpty
          title={tab === 'following' ? 'Your following feed is empty' : 'No posts yet'}
          description={
            tab === 'following'
              ? 'Follow people who explain things well and their posts will appear here.'
              : 'Be the first to share a question, explanation or note.'
          }
        />
      ) : (
        <>
          {posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMore && (
            <div className="text-center" style={{ marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => void loadMore()} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
