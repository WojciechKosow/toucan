import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  downloadVersion,
  getConversation,
  sendConversationMessage,
  startConversation,
} from '../lib/endpoints';
import { ApiError } from '../lib/api';
import type { ConversationDTO, VersionDTO } from '../lib/types';
import { useAuth } from '../auth/authContext';

const POLL_MS = 1500;

function isInProgress(status: ConversationDTO['status'] | undefined): boolean {
  return status === 'PENDING' || status === 'GENERATING';
}

function errorMessageOf(error: unknown): string | null {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return error ? String(error) : null;
}

export function GeneratePage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Seed the cache from a mutation result so the thread updates with no flash,
  // then let the poll (below) take over.
  function adopt(conv: ConversationDTO) {
    setConversationId(conv.id);
    queryClient.setQueryData(['conversation', conv.id], conv);
  }

  const startMutation = useMutation({
    mutationFn: startConversation,
    onSuccess: adopt,
  });

  const editMutation = useMutation({
    mutationFn: (message: string) =>
      sendConversationMessage(conversationId as string, message),
    onSuccess: adopt,
  });

  // Poll the conversation while its latest turn is still processing.
  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => getConversation(conversationId as string),
    enabled: conversationId !== null,
    refetchInterval: (query) => (isInProgress(query.state.data?.status) ? POLL_MS : false),
  });

  const conversation = conversationQuery.data ?? startMutation.data ?? null;
  const versions = conversation?.versions ?? [];
  const currentVersion = conversation?.currentVersion ?? null;
  const isReady = conversation?.status === 'READY' && currentVersion !== null;
  const canEdit = conversationId !== null && currentVersion !== null;

  const inProgress =
    startMutation.isPending || editMutation.isPending || isInProgress(conversation?.status);

  // Show the just-sent message immediately, before the POST resolves.
  const pending = startMutation.isPending
    ? startMutation.variables
    : editMutation.isPending
      ? editMutation.variables
      : null;

  // Once the current version is READY, fetch its self-contained HTML for the preview.
  const previewQuery = useQuery({
    queryKey: ['preview', conversationId, currentVersion],
    queryFn: () => downloadVersion(conversationId as string, currentVersion as number),
    enabled: conversationId !== null && isReady,
    staleTime: Infinity,
  });

  const sendError = errorMessageOf(startMutation.error ?? editMutation.error);

  // Keep the thread pinned to the newest message.
  const threadEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [versions.length, pending, inProgress]);

  function send() {
    const message = draft.trim();
    if (!message || inProgress) return;
    if (canEdit) {
      editMutation.mutate(message);
    } else {
      // No conversation yet, or the first turn failed — start a fresh chat.
      startMutation.mutate(message);
    }
    setDraft('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleNewChat() {
    setConversationId(null);
    setDraft('');
    startMutation.reset();
    editMutation.reset();
  }

  const isEmpty = versions.length === 0 && pending === null;
  const placeholder = canEdit
    ? 'Ask for a change… (e.g. make the arrows blue)'
    : 'Describe the animation you want';

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
        <section className="panel chat">
          <div className="chat-head">
            <span className="chat-title">Chat</span>
            {conversationId && (
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={handleNewChat}
                disabled={inProgress}
              >
                New chat
              </button>
            )}
          </div>

          <div className="chat-thread">
            {isEmpty ? (
              <div className="chat-hint">
                <p className="muted">
                  Describe the animation you want. After it's ready, keep chatting to refine
                  it — each message edits the current animation.
                </p>
              </div>
            ) : (
              <>
                {versions.map((v) => (
                  <VersionTurn key={v.versionNumber} version={v} />
                ))}
                {pending && (
                  <>
                    <div className="msg msg-user">
                      <div className="bubble bubble-user">{pending}</div>
                    </div>
                    <div className="msg msg-bot">
                      <div className="bubble bubble-bot">
                        <span className="dot-spinner" /> Working on it…
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            <div ref={threadEndRef} />
          </div>

          {sendError && <p className="alert alert-error chat-error">{sendError}</p>}

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              rows={2}
              placeholder={placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={inProgress}
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={inProgress || draft.trim().length === 0}
            >
              {inProgress ? 'Working…' : canEdit ? 'Send' : 'Generate'}
            </button>
          </form>
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
              ) : previewQuery.error instanceof Error ? (
                <p>Couldn't load the preview: {previewQuery.error.message}</p>
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

/** One turn in the thread: the user's message and what the animation did with it. */
function VersionTurn({ version }: { version: VersionDTO }) {
  const { status, message, versionNumber, errorMessage } = version;
  return (
    <>
      <div className="msg msg-user">
        <div className="bubble bubble-user">{message}</div>
      </div>
      <div className="msg msg-bot">
        {status === 'READY' ? (
          <div className="bubble bubble-bot">
            {versionNumber === 1 ? 'Here’s your animation.' : 'Updated the animation.'}
            <span className="version-tag">v{versionNumber}</span>
          </div>
        ) : status === 'FAILED' ? (
          <div className="bubble bubble-bot bubble-error">
            {errorMessage ?? 'That turn failed. Try rephrasing.'}
          </div>
        ) : (
          <div className="bubble bubble-bot">
            <span className="dot-spinner" /> Working on it…
          </div>
        )}
      </div>
    </>
  );
}
