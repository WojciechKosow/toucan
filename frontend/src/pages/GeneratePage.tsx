import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { downloadVersion, getConversation, startConversation } from '../lib/endpoints';
import { ApiError } from '../lib/api';
import type { ConversationDTO } from '../lib/types';
import { useAuth } from '../auth/authContext';

const POLL_MS = 1500;

function isInProgress(status: ConversationDTO['status'] | undefined): boolean {
  return status === 'PENDING' || status === 'GENERATING';
}

export function GeneratePage() {
  const { user, logout } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: startConversation,
    onSuccess: (conv) => setConversationId(conv.id),
  });

  // Poll the conversation while its latest version is still processing.
  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => getConversation(conversationId as string),
    enabled: conversationId !== null,
    refetchInterval: (query) => (isInProgress(query.state.data?.status) ? POLL_MS : false),
  });

  const conversation = conversationQuery.data;
  const currentVersion = conversation?.currentVersion ?? null;
  const isReady = conversation?.status === 'READY' && currentVersion !== null;

  // Once READY, fetch the version's self-contained HTML for the preview.
  const previewQuery = useQuery({
    queryKey: ['preview', conversationId, currentVersion],
    queryFn: () => downloadVersion(conversationId as string, currentVersion as number),
    enabled: conversationId !== null && isReady,
    staleTime: Infinity,
  });

  const latestVersion = conversation?.versions?.at(-1) ?? null;
  const failed = conversation?.status === 'FAILED';
  const inProgress = startMutation.isPending || isInProgress(conversation?.status);

  const startError = startMutation.error;
  const startErrorMessage =
    startError instanceof ApiError ? startError.message : startError ? String(startError) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || inProgress) return;
    startMutation.mutate(trimmed);
  }

  function handleNew() {
    setConversationId(null);
    setPrompt('');
    startMutation.reset();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🦜</span>
          <span className="brand-name">Toucan</span>
        </div>
        <div className="topbar-right">
          {user && <span className="muted">{user.email}</span>}
          <button className="btn btn-ghost" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="generate">
        <section className="panel controls">
          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>Describe the animation you want</span>
              <textarea
                rows={5}
                placeholder="e.g. Explain how a hash map handles a collision"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={inProgress}
              />
            </label>
            <div className="controls-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={inProgress || prompt.trim().length === 0}
              >
                {inProgress ? 'Generating…' : 'Generate'}
              </button>
              {conversationId && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={handleNew}
                  disabled={inProgress}
                >
                  New animation
                </button>
              )}
            </div>
          </form>

          {startErrorMessage && <p className="alert alert-error">{startErrorMessage}</p>}

          {conversationId && (
            <div className="status">
              <StatusRow
                status={conversation?.status}
                loading={conversationQuery.isPending && !conversation}
              />
              {failed && latestVersion?.errorMessage && (
                <p className="alert alert-error">{latestVersion.errorMessage}</p>
              )}
              {previewQuery.error instanceof Error && (
                <p className="alert alert-error">
                  Couldn't load the preview: {previewQuery.error.message}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="panel preview">
          {previewQuery.data ? (
            <iframe
              className="preview-frame"
              title="animation preview"
              sandbox="allow-scripts"
              srcDoc={previewQuery.data}
            />
          ) : (
            <div className="preview-empty">
              {inProgress ? (
                <>
                  <div className="spinner" />
                  <p>Rendering your animation…</p>
                </>
              ) : failed ? (
                <p>Generation failed. Adjust your prompt and try again.</p>
              ) : (
                <p className="muted">Your animation will appear here.</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusRow({
  status,
  loading,
}: {
  status: ConversationDTO['status'] | undefined;
  loading: boolean;
}) {
  const label = loading ? 'PENDING' : (status ?? 'PENDING');
  const tone = label === 'READY' ? 'ok' : label === 'FAILED' ? 'error' : 'busy';
  return (
    <p className="status-row">
      <span className={`badge badge-${tone}`}>{label}</span>
    </p>
  );
}
