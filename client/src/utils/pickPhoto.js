import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

// Opens the native "Take Photo / Choose from Library" action sheet on iOS
// and Android via @capacitor/camera. This is the one call that actually
// registers the Camera and Photo Library permissions with the OS — every
// photo-upload spot in the app routes through this instead of a plain
// <input type="file">, since a plain file input's iOS photo picker
// (PHPickerViewController) needs no permission grant at all, and so would
// never make Camera/Photos show up on the app's native Settings page.
// On the web build (e.g. opened as a plain website, not through Capacitor),
// @capacitor/camera's own web implementation transparently falls back to a
// standard file-picker dialog, so this works unchanged there too.
// Resolves to a base64 data URL, or null if the user backed out of the
// picker/action sheet (not a real error — callers shouldn't show one).
export async function pickPhoto({ quality = 70 } = {}) {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      quality,
    });
    return photo?.dataUrl || null;
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('cancel')) return null;
    throw err;
  }
}
