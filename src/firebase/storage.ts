import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './config';
import { api } from './functions';
import { friendlyError } from '../utils/errors';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Uploads an avatar and records the resulting URL on the profile. */
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  if (!TYPES.includes(file.type)) {
    throw friendlyError({ code: 'invalid-argument', message: 'Please choose a PNG, JPG or WebP image.' });
  }
  if (file.size > MAX_BYTES) {
    throw friendlyError({ code: 'invalid-argument', message: 'Avatars must be smaller than 2 MB.' });
  }
  const extension = file.type.split('/')[1] ?? 'png';
  const target = ref(storage, `avatars/${uid}/avatar.${extension}`);
  await uploadBytes(target, file, { contentType: file.type });
  const url = await getDownloadURL(target);
  await api.updateAvatar(url);
  return url;
}
