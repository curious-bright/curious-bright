import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { apiFetch } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { CursorTag } from '../components/CursorTag';
import { CuriousLoading, CuriousError } from '../components/CuriousStates';
import { motion } from 'framer-motion';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ReactReader } from 'react-reader';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentItem {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  academicLevel?: string;
  license?: string;
  cached?: boolean;
}

export default function Read() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [docItem, setDocItem] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfError, setPdfError] = useState(false);
  const [locationEpub, setLocationEpub] = useState<string | number>(0);

  // Demo Co-author Gliding Cursors & Live Typing Ripple
  const [collaborators, setCollaborators] = useState([
    { id: '1', name: 'Amara', action: 'reading page 1', color: '#FF5A36', x: 120, y: 180 },
    { id: '2', name: 'Mateo', action: 'highlighting', color: '#00A896', x: 420, y: 310 },
  ]);

  const [liveMarginNote, setLiveMarginNote] = useState('');
  const fullNoteText = "This passage directly connects with the quantum model discussed in chapter 4.";

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setCollaborators(prev => prev.map(c => ({
        ...c,
        x: Math.min(680, Math.max(40, c.x + (Math.random() * 160 - 80))),
        y: Math.min(540, Math.max(120, c.y + (Math.random() * 120 - 60))),
      })));
    }, 3200);

    let charIndex = 0;
    const typingInterval = setInterval(() => {
      if (charIndex <= fullNoteText.length) {
        setLiveMarginNote(fullNoteText.slice(0, charIndex));
        charIndex++;
      } else {
        setTimeout(() => { charIndex = 0; }, 3000);
      }
    }, 70);

    return () => {
      clearInterval(cursorInterval);
      clearInterval(typingInterval);
    };
  }, []);

  useEffect(() => {
    const fetchDocument = async () => {
      setLoading(true);
      setError('');

      const navState = location.state as { fileUrl?: string; title?: string; description?: string; academicLevel?: string; license?: string } | null;
      if (navState?.fileUrl) {
        setDocItem({
          id: id || 'doc',
          title: navState.title || 'Shared Document',
          description: navState.description,
          fileUrl: navState.fileUrl,
          academicLevel: navState.academicLevel,
          license: navState.license,
        });
        setLoading(false);
        return;
      }

      try {
        const bookData = await apiFetch(`/books/${id}/read`);
        if (bookData?.fileUrl && bookData?.book) {
          setDocItem({
            id: bookData.book.id,
            title: bookData.book.title,
            description: bookData.book.description,
            fileUrl: bookData.fileUrl,
            academicLevel: bookData.book.academicLevel,
            license: bookData.book.license,
            cached: bookData.cached,
          });
          setLoading(false);
          return;
        }
      } catch (e) {
        // Fallback to Submissions endpoint
      }

      try {
        const subData = await apiFetch(`/submissions/${id}`);
        if (subData?.fileUrl) {
          setDocItem({
            id: subData.id,
            title: subData.title,
            description: subData.description,
            fileUrl: subData.fileUrl,
            academicLevel: subData.academicLevel,
            license: subData.license,
          });
          setLoading(false);
          return;
        }
      } catch (e: any) {
        setError('We could not find this document or it is currently unavailable.');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchDocument();
    }
  }, [id, location.state]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPdfError(false);
  }

  if (loading) {
    return <CuriousLoading message="Opening shared document & syncing margin notes..." />;
  }

  if (error || !docItem) {
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

  const fileUrl = docItem.fileUrl;
  const isEpub = fileUrl?.toLowerCase().includes('.epub') || fileUrl?.toLowerCase().includes('epub+zip');

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
            <h2 style={{ fontSize: '1.35rem' }}>{docItem.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              {docItem.license && <span className="badge-tag badge-mustard">{docItem.license}</span>}
              {docItem.academicLevel && <span className="badge-tag badge-teal">{docItem.academicLevel.replace('_', ' ')}</span>}
              {docItem.cached && <span className="badge-tag badge-coral"><i className="bx bx-bolt-circle"></i> Ready instantly</span>}
            </div>
          </div>
        </div>

        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}>
            <i className="bx bx-download" style={{ fontSize: '1.1rem' }}></i>
            <span>Save Local Copy</span>
          </a>
        )}
      </div>

      {/* Abstract & Live Typing Ripple Card */}
      <div style={{ maxWidth: '860px', width: '100%' }} className="mb-6">
        <CommentCornerCard commentPreview="Hover to inspect margin activity">
          <div className="flex justify-between items-start gap-4 mb-2">
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-faded-ink)' }} className="flex items-center gap-1">
              <i className="bx bx-notepad" style={{ fontSize: '0.95rem' }}></i>
              Summary & Margin Notes
            </h4>
            <span className="badge-tag badge-coral" style={{ fontSize: '0.6875rem' }}>
              Amara is typing live...
            </span>
          </div>
          {docItem.description && (
            <p className="text-muted text-sm mb-3">{docItem.description}</p>
          )}

          {/* Live Typing Ripple Box */}
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--color-paper)',
              border: '1.5px solid var(--color-line)',
              borderRadius: '4px 0px 4px 4px',
              fontSize: '0.875rem',
              fontStyle: 'italic',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ color: '#FF5A36', fontWeight: 700 }}>Amara:</span>
            <span>"{liveMarginNote}"</span>
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{ width: '2px', height: '14px', background: '#FF5A36', display: 'inline-block' }}
            />
          </div>
        </CommentCornerCard>
      </div>

      {/* PDF Reader Canvas Frame with Gliding Cursor Tags */}
      <div style={{ maxWidth: '860px', width: '100%', position: 'relative' }}>
        {collaborators.map((c) => (
          <CursorTag
            key={c.id}
            id={c.id}
            name={c.name}
            action={c.action}
            color={c.color}
            x={c.x}
            y={c.y}
          />
        ))}

        <CommentCornerCard style={{ padding: '1.5rem', minHeight: '520px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {isEpub ? (
            <div style={{ position: 'relative', height: '600px', width: '100%', maxWidth: '760px' }}>
              <ReactReader
                url={fileUrl}
                title={docItem.title}
                location={locationEpub}
                locationChanged={(epubLocation: string) => setLocationEpub(epubLocation)}
              />
            </div>
          ) : pdfError ? (
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
          {!isEpub && numPages && numPages > 0 && !pdfError && (
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
