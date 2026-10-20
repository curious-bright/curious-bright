import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch, resultsOf } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';

interface PostItem {
  id: number;
  author: { id: number; username: string };
  title: string;
  body: string;
  subject: string;
  kind: string;
  academic_level: string;
  attachment_url: string | null;
  attachment_name: string;
  is_solved: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
}

const LEVELS = ['ALL', 'high_school', 'college', 'graduate', 'professional'];

const KIND_LABELS: Record<string, string> = {
  question: 'Question',
  explanation: 'Explanation',
  note: 'Note',
  resource: 'Resource',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Browse() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'PAPERS' | 'NOTES'>('PAPERS');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce keyword search so typing doesn't hammer the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;
    const fetchCatalog = async () => {
      setLoading(page === 1);
      const params = new URLSearchParams();
      params.set('status', 'published');
      params.set('attachment', activeTab === 'PAPERS' ? 'only' : 'none');
      if (selectedLevel !== 'ALL') params.set('academic_level', selectedLevel);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (page > 1) params.set('page', String(page));

      const data = await apiFetch<{ count: number; results: PostItem[] }>(`/posts/?${params.toString()}`);
      if (cancelled) return;

      const items = resultsOf<PostItem>(data);
      setTotal(data?.count ?? items.length);
      setPosts(prev => (page === 1 ? items : [...prev, ...items]));
      setLoading(false);
    };
    fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedLevel, debouncedSearch, page]);

  const isPapers = activeTab === 'PAPERS';
  const hasMore = posts.length < total;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>
            <HighlighterText color="#F4B43D">Open Academic Repository</HighlighterText>
          </h2>
          <p className="text-muted text-sm mt-2">
            Explore shared papers with downloadable PDFs and community-written notes and questions.
          </p>
        </div>

        {/* Tab Switcher with Boxicons */}
        <div className="flex gap-2" style={{ background: 'var(--color-paper-card)', padding: '0.3rem', borderRadius: '4px 0px 4px 4px', border: '1.5px solid var(--color-line)' }}>
          <button
            className={`btn ${isPapers ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1.1rem', fontSize: '0.8125rem' }}
            onClick={() => {
              setActiveTab('PAPERS');
              setPage(1);
            }}
          >
            <i className="bx bx-file-pdf" style={{ fontSize: '1rem' }}></i>
            <span>{total > 0 && isPapers ? `${total} ` : ''}Shared Papers</span>
          </button>
          <button
            className={`btn ${!isPapers ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1.1rem', fontSize: '0.8125rem' }}
            onClick={() => {
              setActiveTab('NOTES');
              setPage(1);
            }}
          >
            <i className="bx bx-note" style={{ fontSize: '1rem' }}></i>
            <span>{total > 0 && !isPapers ? `${total} ` : ''}Community Notes</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="comment-corner-card mb-6" style={{ padding: '1.25rem' }}>
        <div className="flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
          <div className="flex-1" style={{ minWidth: '220px' }}>
            <input
              type="text"
              placeholder={isPapers ? 'Search shared papers by title or summary...' : 'Search notes, questions and explanations...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ minWidth: '200px' }}>
            <select value={selectedLevel} onChange={e => { setSelectedLevel(e.target.value); setPage(1); }}>
              {LEVELS.map(level => (
                <option key={level} value={level}>
                  {level === 'ALL' ? 'All Learning Levels' : level.replace('_', ' ').replace(/^./, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading & catalog views */}
      {loading && posts.length === 0 ? (
        <CuriousLoading message="Opening the community repository..." />
      ) : posts.length === 0 ? (
        <CuriousEmpty
          title={isPapers ? 'No Shared Papers Found' : 'No Community Notes Found'}
          description={
            isPapers
              ? 'Be the first co-author to publish a paper to the community notebook!'
              : 'Nothing matched your current query or filters. Try adjusting your search.'
          }
          flourishText="Community Notebook"
          actionButton={
            isPapers ? (
              <Link to="/submit" className="btn btn-primary">
                <span>Share a Paper</span>
                <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
              </Link>
            ) : (
              <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setSelectedLevel('ALL'); }}>
                Reset Search Filters
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="grid-container">
            {posts.map(post => (
              <CommentCornerCard
                key={post.id}
                commentPreview={
                  isPapers
                    ? `Shared PDF: ${post.attachment_name || post.title.slice(0, 32)}`
                    : `Note by @${post.author.username} — peel corner for margin notes.`
                }
                className="flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`badge-tag ${isPapers ? 'badge-teal' : 'badge-mustard'}`}>
                      {isPapers ? 'Shared Paper' : KIND_LABELS[post.kind] || 'Note'}
                    </span>
                    <span className="badge-tag badge-coral">
                      {post.academic_level.replace('_', ' ').replace(/^./, c => c.toUpperCase())}
                    </span>
                  </div>

                  <h3 className="mb-2" style={{ fontSize: '1.15rem', lineHeight: '1.35' }}>
                    {post.title}
                  </h3>

                  <p className="text-xs text-muted mb-3 flex items-center gap-1" style={{ fontWeight: 600 }}>
                    <i className="bx bx-pen" style={{ fontSize: '0.9rem' }}></i>
                    @{post.author.username} • {post.subject.replace(/^./, c => c.toUpperCase())} • {timeAgo(post.created_at)}
                  </p>

                  <p className="text-muted text-sm mb-4" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {post.body}
                  </p>

                  <div className="flex gap-1" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {post.like_count > 0 && (
                      <span className="badge-tag" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem' }}>
                        <i className="bx bx-like" style={{ fontSize: '0.8rem' }}></i> {post.like_count}
                      </span>
                    )}
                    <span className="badge-tag" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem' }}>
                      <i className="bx bx-comment" style={{ fontSize: '0.8rem' }}></i> {post.comment_count}
                    </span>
                    {post.is_solved && (
                      <span className="badge-tag badge-teal" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem' }}>
                        <i className="bx bx-check-circle" style={{ fontSize: '0.8rem' }}></i> Solved
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4" style={{ borderTop: '1.5px solid var(--color-line)', marginTop: '1rem' }}>
                  <span className="text-xs text-muted font-medium flex items-center gap-1">
                    <i
                      className={`bx ${isPapers ? 'bx-file-pdf' : 'bx-message-rounded-dots'}`}
                      style={{ fontSize: '0.9rem', color: 'var(--color-mustard)' }}
                    ></i>
                    {isPapers ? 'Downloadable PDF' : `${post.comment_count} replies`}
                  </span>
                  <button
                    onClick={() => navigate(isPapers ? `/read/${post.id}` : `/post/${post.id}`)}
                    className="btn btn-primary"
                    style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}
                  >
                    <span>{isPapers ? 'Read Paper' : 'Open Note'}</span>
                    <i className="bx bx-right-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
                  </button>
                </div>
              </CommentCornerCard>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => setPage(prev => prev + 1)}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <i className="bx bx-loader-alt bx-spin"></i> Loading...
                  </span>
                ) : (
                  <span>
                    Load more ({posts.length} of {total})
                  </span>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
