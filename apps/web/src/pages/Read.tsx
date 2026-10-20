import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { apiFetch } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { CuriousLoading, CuriousError } from '../components/CuriousStates';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface SharedPaper {
  id: number;
  title: string;
  body: string;
  subject: string;
  kind: string;
  academic_level: string;
  attachment_url: string | null;
  attachment_name: string;
  author: { id: number; username: string };
  created_at: string;
}

export default function Read() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [paper, setPaper] = useState<SharedPaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfError, setPdfError] = useState(false);

  useEffect(() => {
    const fetchDocument = async () => {
      if (!id) return;
      setLoading(true);
      setError('');

      const data = await apiFetch<SharedPaper & { attachment_url: string | null }>(`/posts/${id}/`);
      if (!data) {
        setError('We could not find this document or it is currently unavailable.');
        setLoading(false);
        return;
      }

      // Notes without a PDF belong on the discussion page instead.
      if (!data.attachment_url) {
        navigate(`/post/${id}`, { replace: true });
        return;
      }

      setPaper(data);
      setLoading(false);
    };

    fetchDocument();
  }, [id, navigate]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPdfError(false);
  }

  if (loading) {
    return <CuriousLoading message="Opening shared document..." />;
  }

  if (error || !paper) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto' }}>
        <CuriousError
          title="Document Unavailable"
          message={error || 'The requested document could not be opened.'}
          onRetry={() => navigate('/browse')}
        />
      </div>
    );
  }

  const fileUrl = paper.attachment_url!;

  return (
    <div className="flex flex-col items-center">
      {/* Top Controls Bar with Boxicons */}
      <div className="w-full flex justify-between items-center mb-6" style={{ maxWidth: '860px', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ padding: '0.45rem 0.85rem', fontSize: '0.8125rem' }}>
            <i className="bx bx-left-arrow-alt" style={{ fontSize: '1.1rem' }}></i>
            <span>Back</span>
          </button>
          <div>
            <h2 style={{ fontSize: '1.35rem' }}>{paper.title}</h2>
            <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
              <span className="badge-tag badge-mustard">{paper.attachment_name || 'Shared PDF'}</span>
              <span className="badge-tag badge-teal">
                {paper.academic_level.replace('_', ' ').replace(/^./, c => c.toUpperCase())}
              </span>
              <span className="badge-tag badge-coral">@{paper.author.username}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => navigate(`/post/${paper.id}`)} style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}>
            <i className="bx bx-message-rounded-dots" style={{ fontSize: '1.1rem' }}></i>
            <span>Discuss</span>
          </button>
          <a href={fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}>
            <i className="bx bx-download" style={{ fontSize: '1.1rem' }}></i>
            <span>Save Local Copy</span>
          </a>
        </div>
      </div>

      {/* Summary Card */}
      <div style={{ maxWidth: '860px', width: '100%' }} className="mb-6">
        <CommentCornerCard commentPreview={`Shared by @${paper.author.username} — open the discussion for margin notes`}>
          <div className="flex justify-between items-start gap-4 mb-2">
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-faded-ink)' }} className="flex items-center gap-1">
              <i className="bx bx-notepad" style={{ fontSize: '0.95rem' }}></i>
              Summary
            </h4>
            <span className="badge-tag badge-coral" style={{ fontSize: '0.6875rem' }}>
              {paper.subject.replace(/^./, c => c.toUpperCase())}
            </span>
          </div>
          <p className="text-muted text-sm">{paper.body}</p>
        </CommentCornerCard>
      </div>

      {/* PDF Reader Canvas Frame */}
      <div style={{ maxWidth: '860px', width: '100%', position: 'relative' }}>
        <CommentCornerCard style={{ padding: '1.5rem', minHeight: '520px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {pdfError ? (
            <div className="text-center p-8">
              <p className="font-semibold mb-2">Unable to render PDF preview directly in browser.</p>
              <p className="text-muted text-sm mb-4">You can download the full PDF to read offline.</p>
              <a href={fileUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                <i className="bx bx-download" style={{ fontSize: '1.1rem' }}></i>
                <span>Download PDF Document</span>
              </a>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => {
                console.error('PDF load error:', err);
                setPdfError(true);
              }}
              loading={<CuriousLoading message="Rendering pages..." />}
            >
              <Page pageNumber={pageNumber} renderTextLayer={true} renderAnnotationLayer={true} width={760} />
            </Document>
          )}

          {/* Page Controls with Boxicons */}
          {numPages && numPages > 0 && !pdfError && (
            <div className="flex items-center gap-4 mt-6 pt-4" style={{ borderTop: '1.5px solid var(--color-line)', width: '100%', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber(prev => prev - 1)}
                style={{ padding: '0.4rem 0.85rem' }}
              >
                <i className="bx bx-chevron-left" style={{ fontSize: '1.1rem' }}></i>
                <span>Previous</span>
              </button>

              <span className="text-sm font-medium">
                Page <strong style={{ color: 'var(--color-ink)' }}>{pageNumber}</strong> of {numPages}
              </span>

              <button
                className="btn btn-secondary"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber(prev => prev + 1)}
                style={{ padding: '0.4rem 0.85rem' }}
              >
                <span>Next</span>
                <i className="bx bx-chevron-right" style={{ fontSize: '1.1rem' }}></i>
              </button>
            </div>
          )}
        </CommentCornerCard>
      </div>
    </div>
  );
}
