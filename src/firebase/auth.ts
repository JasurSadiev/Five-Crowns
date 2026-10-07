import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './config';
import { api } from './functions';
import { friendlyError } from '../utils/errors';

export type { User };

/**
 * Subscribes to the signed-in user.
 *
 * The error callback is not optional in practice: if the Auth SDK cannot reach
 * its backend (bad config, emulator settings baked into a production build, a
 * blocked domain) the success callback never fires, and any UI gated on "have
 * we resolved auth yet" would spin forever.
 */
export function watchAuth(
  callback: (user: User | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onAuthStateChanged(auth, callback, (error) => onError?.(error as Error));
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    }
    await api.ensureProfile();
    if (displayName.trim()) {
      await api.updateUsername(displayName.trim()).catch(() => undefined);
    }
    await sendEmailVerification(credential.user).catch(() => undefined);
    return credential.user;
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function signInWithGoogle(): Promise<User> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    await api.ensureProfile();
    return credential.user;
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function resendVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw friendlyError({ code: 'unauthenticated' });
  try {
    await sendEmailVerification(user);
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function refreshEmailVerified(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  if (user.emailVerified) await api.syncEmailVerified().catch(() => undefined);
  return user.emailVerified;
}

/** Deletes server data first, then the Auth user (re-authenticating if asked). */
export async function deleteAccount(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw friendlyError({ code: 'unauthenticated' });
  try {
    if (password && user.email) {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    }
    await api.deleteAccount();
  } catch (error) {
    const err = friendlyError(error);
    if (err.code === 'auth/requires-recent-login') throw err;
    // The server may already have removed the Auth user.
    if (auth.currentUser) {
      await deleteUser(auth.currentUser).catch(() => undefined);
    }
    if (err.code !== 'internal') throw err;
  }
}
