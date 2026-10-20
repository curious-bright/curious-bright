import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { CommentCornerCard } from '../components/CommentCornerCard';
import { HighlighterText } from '../components/HighlighterText';
import { useAuth } from '../state/AuthContext';

const ACADEMIC_LEVELS = [
  { value: 'high_school', label: 'High School & Secondary' },
  { value: 'college', label: 'Undergraduate College' },
  { value: 'graduate', label: 'Graduate & Postgraduate' },
  { value: 'professional', label: 'Professional & Scholar' },
];

const SUBJECTS = ['research', 'math', 'science', 'programming', 'language', 'general'];

export default function Submit() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('research');
  const [academicLevel, setAcademicLevel] = useState('college');
  const [file, setFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!loading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.toLowerCase().endsWith('.pdf')) {
        setError('Only PDF documents are accepted for shared papers.');
        return;
      }
      if (selected.size > 25 * 1024 * 1024) {
        setError('PDFs are limited to 25 MB.');
        return;
      }
      setError('');
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !file) {
      setError('Please provide a title, plain summary, and a PDF file.');
      return;
    }

    setUploading(true);
    setError('');

    // Single multipart request: Django stores the PDF on the post itself and
    // places uploads into the peer review queue (review_status = pending).
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('body', description.trim());
    formData.append('kind', 'resource');
    formData.append('subject', subject);
    formData.append('academic_level', academicLevel);
    formData.append('attachment', file);

    const created = await apiFetch('/posts/', {
      method: 'POST',
      body: formData,
    });

    setUploading(false);

    if (!created) return; // apiFetch already surfaced the error globally

    setSuccess('Your paper was submitted to the community peer review queue!');
    setTimeout(() => navigate('/browse'), 2000);
  };

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div className="mb-6 text-center">
        <h2>
          <HighlighterText color="#FF5A36">Publish a Shared Paper</HighlighterText>
        </h2>
        <p className="text-muted text-sm mt-2">
          Share your research, study guide, or open notes with co-authors across the notebook.
        </p>
      </div>

      <CommentCornerCard commentPreview="Submissions undergo community peer review for open-access licensing">
        {error && (
          <div className="alert alert-error mb-4">
            <span className="flex items-center gap-1.5">
              <i className="bx bx-error-circle" style={{ fontSize: '1.1rem' }}></i>
              {error}
            </span>
          </div>
        )}

        {success && (
          <div className="alert alert-info mb-4">
            <span className="flex items-center gap-1.5">
              <i className="bx bx-check-circle" style={{ fontSize: '1.1rem' }}></i>
              {success}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Paper Title
            </label>
            <input
              type="text"
              placeholder="e.g., An Introduction to Atmospheric Physics"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Subject Area
              </label>
              <select value={subject} onChange={e => setSubject(e.target.value)}>
                {SUBJECTS.map(s => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Learning Level Target
              </label>
              <select value={academicLevel} onChange={e => setAcademicLevel(e.target.value)}>
                {ACADEMIC_LEVELS.map(level => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Plain Summary & Overview
            </label>
            <textarea
              rows={4}
              placeholder="Explain the key takeaways in plain language without unnecessary jargon..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>

          {/* PDF Upload Zone with Boxicons */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              PDF Document Attachment
            </label>
            <div
              style={{
                border: '2px dashed var(--color-line)',
                background: 'var(--color-paper)',
                padding: '1.75rem',
                borderRadius: '4px 0px 4px 4px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
              onClick={() => document.getElementById('paper-file-input')?.click()}
            >
              <input
                id="paper-file-input"
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {file ? (
                <div className="flex items-center justify-center gap-2" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>
                  <i className="bx bx-file-pdf" style={{ fontSize: '1.5rem', color: 'var(--color-coral)' }}></i>
                  <span>{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                </div>
              ) : (
                <div>
                  <i className="bx bx-cloud-upload" style={{ fontSize: '2rem', color: 'var(--color-faded-ink)', marginBottom: '0.5rem' }}></i>
                  <p className="font-semibold text-sm mb-1">Click to select PDF document</p>
                  <p className="text-xs text-muted">Supports original manuscripts & open notes up to 25 MB</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={uploading || !file || !title.trim()}
              style={{ padding: '0.75rem', fontSize: '0.9375rem' }}
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1.1rem' }}></i>
                  Uploading PDF & Submitting...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <i className="bx bx-paper-plane" style={{ fontSize: '1.1rem' }}></i>
                  Submit Paper to Peer Review
                </span>
              )}
            </button>
          </div>
        </form>
      </CommentCornerCard>
    </div>
  );
}
