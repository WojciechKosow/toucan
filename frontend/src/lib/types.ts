// Shared DTO shapes mirroring the Spring backend (see FRONTEND-PLAN.md §API contract).

export type AnimationStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: string;
  verified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface VersionDTO {
  versionNumber: number;
  /** The user's message for this turn. */
  message: string;
  status: AnimationStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface ConversationDTO {
  id: string;
  title: string | null;
  /** Derived from the latest version's status. */
  status: AnimationStatus;
  /** Version the preview currently shows; null until the first version is READY. */
  currentVersion: number | null;
  previewUrl: string | null;
  /** Present on the single-conversation view; absent on the list view. */
  versions?: VersionDTO[];
  createdAt: string;
}
