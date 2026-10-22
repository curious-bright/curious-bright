import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiDownload, apiVoid, clearTokens } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { CuriousLoading } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, isAuthenticated, updateProfile, changePassword, logout, refreshMe } = useAuth();

  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState('');
  const [country, setCountry] = useState('');
  const [school, setSchool] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const passwordSection = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!user) return;
    setBio(user.profile.bio || '');
    setExpertise(user.profile.subject_expertise || '');
    setCountry(user.profile.country || '');
    setSchool(user.profile.school || '');
  }, [user?.id]);

  useEffect(() => {
    if (searchParams.get('change-password') === '1') {
      window.setTimeout(() => passwordSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [searchParams, user?.id]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  if (loading) return <CuriousLoading message="Opening your account…" />;
  if (!isAuthenticated || !user) {
    return (
      <div className="alert alert-info" style={{ maxWidth: 560, margin: '2rem auto' }}>
        <span>
          <Link to="/login" style={{ fontWeight: 700 }}>Sign in</Link> to manage your account.
        </span>
      </div>
    );
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    if (avatarFile && avatarFile.size > 5 * 1024 * 1024) {
      setProfileError('Avatar images must be 5 MB or smaller.');
      return;
    }
    setSavingProfile(true);
    setProfileSaved(false);
    const ok = await updateProfile(
      { bio, subject_expertise: expertise, country, school },
      avatarFile,
    );
    setSavingProfile(false);
    if (ok) {
      setProfileSaved(true);
      setAvatarFile(null);
      if (avatarInput.current) avatarInput.current.value = '';
      window.setTimeout(() => setProfileSaved(false), 4000);
    } else {
      setProfileError('We could not save your profile. Check the details above and try again.');
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Choose at least 8 characters.');
      return;
    }
    setChangingPassword(true);
    const ok = await changePassword(oldPassword, newPassword);
    setChangingPassword(false);
    if (ok) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      window.setTimeout(() => setPasswordSaved(false), 4000);
    }
  };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    const ok = await apiVoid('/auth/delete-account/', {
      method: 'POST',
      body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }),
    });
    setDeleting(false);
    if (ok) {
      clearTokens();
      localStorage.removeItem('user');
      window.location.assign('/login');
    }
  };

  const avatar = avatarPreview || user.profile.avatar;

  return (
    <div className="settings-page">
      <header className="settings-heading">
        <span className="eyebrow">Your space</span>
        <h2>
          <HighlighterText color="#FF5A36">Account settings</HighlighterText>
        </h2>
        <p className="text-muted text-sm">
          Manage how you appear, protect your account and take your data with you.
        </p>
        {user.must_change_password && (
          <div className="alert alert-info" style={{ marginTop: '1rem' }}>
            <span><i className="bx bx-key"></i> Your institution created this account. Please choose a new password below.</span>
          </div>
        )}
      </header>

      <nav className="settings-nav" aria-label="Settings sections">
        <a href="#profile">Profile</a>
        <a href="#security">Security</a>
        <a href="#data">Your data</a>
        <a href="#danger">Delete account</a>
      </nav>

      <section id="profile" className="comment-corner-card settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Profile</h3>
            <p className="text-sm text-muted">This is what other members see on your posts and profile.</p>
          </div>
          <Link to={`/profile/${user.username}`} className="btn btn-secondary">View public profile</Link>
        </div>

        <form onSubmit={(e) => void saveProfile(e)} className="settings-form">
          <div className="settings-avatar-row">
            <div
              className="settings-avatar"
              style={avatar ? { backgroundImage: `url(${avatar})`, backgroundSize: 'cover' } : undefined}
            >
              {!avatar && user.username[0]?.toUpperCase()}
            </div>
            <div>
              <label htmlFor="avatar-upload" className="btn btn-secondary upload-label">
                <i className="bx bx-image-add"></i> Change photo
              </label>
              <input
                ref={avatarInput}
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted">JPEG, PNG, WebP or GIF · up to 5 MB.</p>
              {avatarFile && (
                <button type="button" className="text-xs link-button" onClick={() => setAvatarFile(null)}>
                  Remove selected photo
                </button>
              )}
            </div>
          </div>

          <div className="settings-grid">
            <div className="form-group">
              <label htmlFor="settings-username">Username</label>
              <input id="settings-username" value={user.username} readOnly disabled />
            </div>
            <div className="form-group">
              <label htmlFor="settings-email">Email</label>
              <input id="settings-email" value={user.email} readOnly disabled />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="settings-bio">Bio</label>
            <textarea
              id="settings-bio"
              rows={4}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="What do you enjoy teaching or researching?"
            />
            <span className="field-hint">{bio.length}/500</span>
          </div>

          <div className="form-group">
            <label htmlFor="settings-expertise">Helps with</label>
            <input
              id="settings-expertise"
              value={expertise}
              onChange={(e) => setExpertise(e.target.value)}
              placeholder="e.g. Algebra, Essay writing, Machine learning"
              maxLength={120}
            />
          </div>

          <div className="settings-grid">
            <div className="form-group">
              <label htmlFor="settings-school">School or organisation</label>
              <input
                id="settings-school"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="e.g. University of Lagos"
                maxLength={200}
              />
            </div>
            <div className="form-group">
              <label htmlFor="settings-country">Country</label>
              <input
                id="settings-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Nigeria"
                maxLength={100}
              />
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
            {profileSaved && <span className="save-note"><i className="bx bx-check-circle"></i> Profile saved</span>}
          </div>
          {profileError && <p className="field-error">{profileError}</p>}
        </form>
      </section>

      <section id="security" ref={passwordSection} className="comment-corner-card settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Password & security</h3>
            <p className="text-sm text-muted">Use a unique password you don’t reuse elsewhere.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void logout().then(() => navigate('/login'))}>
            Sign out everywhere on this device
          </button>
        </div>

        <form onSubmit={(e) => void submitPassword(e)} className="settings-form">
          <div className="settings-grid">
            <div className="form-group">
              <label htmlFor="old-password">Current password</label>
              <input
                id="old-password"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          {passwordError && <p className="field-error">{passwordError}</p>}
          <div className="settings-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
            >
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
            {passwordSaved && <span className="save-note"><i className="bx bx-check-circle"></i> Password updated</span>}
          </div>
        </form>
      </section>

      <section id="data" className="comment-corner-card settings-card">
        <div className="settings-card-head">
          <div>
            <h3>Your data</h3>
            <p className="text-sm text-muted">
              Download a JSON copy of your profile, posts, comments, research, follows and memberships.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void apiDownload('/auth/export/', `curious-bright-${user.username}.json`)}
          >
            <i className="bx bx-download"></i> Export my data
          </button>
        </div>
        <button type="button" className="text-xs link-button" onClick={() => void refreshMe()}>
          Refresh account details
        </button>
      </section>

      <section id="danger" className="comment-corner-card settings-card danger-zone">
        <div className="settings-card-head">
          <div>
            <h3>Delete account</h3>
            <p className="text-sm text-muted">
              This permanently removes your account, posts, comments, research and memberships. This cannot be undone.
            </p>
          </div>
        </div>
        <form onSubmit={(e) => void deleteAccount(e)} className="settings-form">
          <div className="settings-grid">
            <div className="form-group">
              <label htmlFor="delete-password">Your password</label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="delete-confirm">Type “delete my account”</label>
              <input
                id="delete-confirm"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="delete my account"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={deleting || !deletePassword || deleteConfirmation.trim().toLowerCase() !== 'delete my account'}
          >
            {deleting ? 'Deleting…' : <><i className="bx bx-trash"></i> Permanently delete my account</>}
          </button>
        </form>
      </section>
    </div>
  );
}
