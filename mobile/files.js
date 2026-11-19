import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { deleteAsync, EncodingType, StorageAccessFramework } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

const megabyte = 1024 * 1024;
const uploadLimit = 15 * megabyte;
const imageTypes = new Set(['image/png', 'image/jpeg']);
const exportExtensions = { 'application/pdf': '.pdf', 'application/json': '.json' };

export async function pickFile(image) {
  const result = image
    ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, exif: false, legacy: false })
    : await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const name = asset.fileName || asset.name || file.name;
  const type = asset.mimeType || (image ? (/\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : '') : 'application/pdf');
  const limit = image ? 2 * megabyte : uploadLimit;
  try {
    if (!file.exists || !file.size || file.size > limit || (image && !imageTypes.has(type))) {
      throw new Error(image ? 'Choose a PNG or JPEG signature no larger than 2 MB.' : 'Choose a PDF no larger than 15 MB.');
    }
    return { name, type, base64: await file.base64() };
  } finally {
    if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
  }
}

export async function exportFile({ action, name, type, base64 }) {
  const extension = exportExtensions[type];
  if (!extension || typeof name !== 'string' || typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(uploadLimit / 3) * 4) {
    throw new Error('Choose a PDF or JSON file no larger than 15 MB.');
  }
  const stem = name.toLowerCase().endsWith(extension) ? name.slice(0, -extension.length) : name;
  const label = stem.replace(/[^a-zA-Z0-9 _-]/g, '_').trim().slice(0, 100) || 'SeekGRNJobs';
  const filename = label + extension;

  if (action === 'save') {
    const selection = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!selection.granted) return false;
    const uri = await StorageAccessFramework.createFileAsync(selection.directoryUri, label, type);
    try {
      await StorageAccessFramework.writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
    } catch (error) {
      await deleteAsync(uri, { idempotent: true }).catch(() => {});
      throw error;
    }
    return true;
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
  const folder = new Directory(Paths.cache, 'seekgrn-share');
  folder.create({ idempotent: true });
  for (const item of folder.list()) {
    const timestamp = Number(item.name);
    if (timestamp > 0 && Date.now() - timestamp > 24 * 60 * 60 * 1000) item.delete();
  }
  const attachment = folder.createDirectory(String(Date.now())).createFile(filename, type);
  await attachment.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(attachment.uri, { mimeType: type, dialogTitle: 'Share ' + filename });
  return true;
}
