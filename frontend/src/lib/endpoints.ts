// Typed calls onto the backend endpoints the frontend needs this session.

import { apiJson, apiText } from './api';
import type { AuthResponse, ConversationDTO } from './types';

// --- Auth ---

export function registerUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<string> {
  // Register returns a plain-text confirmation string, not JSON.
  return apiText('/api/auth/register', { method: 'POST', body: input, auth: false });
}

export function loginUser(input: { email: string; password: string }): Promise<AuthResponse> {
  return apiJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: { ...input, rememberMe: false },
    auth: false,
  });
}

// --- Conversations ---

export function startConversation(message: string): Promise<ConversationDTO> {
  return apiJson<ConversationDTO>('/api/conversations', {
    method: 'POST',
    body: { message },
  });
}

export function getConversation(id: string): Promise<ConversationDTO> {
  return apiJson<ConversationDTO>(`/api/conversations/${id}`);
}

/** The version's self-contained HTML animation, for rendering via iframe srcDoc. */
export function downloadVersion(id: string, versionNumber: number): Promise<string> {
  return apiText(`/api/conversations/${id}/versions/${versionNumber}/download`);
}
