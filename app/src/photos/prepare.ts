import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Photos wider than this are made smaller before uploading. */
export const MAX_PHOTO_WIDTH = 1600;
/** JPEG quality, 0-1. 0.8 looks the same as the original to the eye, at a fraction of the size. */
const JPEG_QUALITY = 0.8;

export type PreparedPhoto = { uri: string; width: number; height: number };

/**
 * Make a photo ready to upload: at most 1600 pixels wide, saved as a good-quality JPEG.
 * A 4-6 MB phone photo usually becomes 300-500 KB: fast on mobile data, light for the server.
 */
export async function preparePhoto(photo: { uri: string; width: number }): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (photo.width > MAX_PHOTO_WIDTH) context.resize({ width: MAX_PHOTO_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
