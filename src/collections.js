import {
  Archive, AudioLines, CodeXml, FileText, Film, Image, Layers3, LibraryBig,
} from 'lucide-react';

function collection(id, name, icon, extensions) {
  return { id, name, icon, extensions: extensions?.split(' ').map((ext) => '.' + ext) };
}

export const builtIns = [
  collection('all', '全部扩展名', Layers3),
  collection('video', '视频', Film, 'mp4 mkv avi mov webm wmv m4v mpeg mpg m2ts mts ts flv f4v 3gp 3g2 3gp2 3gpp asf vob ogv ogm rm rmvb divx mxf wtv dvr-ms m1v m2v m2t mp2v mpv2 mpe qt amv dpg evo ifo k3g nsr nsv skm tp tpr trp wm wmp mod mp4v ogx tod tts ivf uvu'),
  collection('image', '图片', Image, 'jpg jpeg jpe jfif png gif webp avif heic heif bmp dib tif tiff svg ico dng raw cr2 cr3 nef arw psd'),
  collection('audio', '音频', AudioLines, 'mp3 wav flac aac m4a m4b m4p ogg opus wma aif aiff ac3 ape mid midi mka alac amr'),
  collection('documents', '文档', FileText, 'pdf txt rtf doc docx dotx odt xls xlsx xlsm ods csv tsv ppt pptx odp epub md'),
  collection('archive', '压缩包', Archive, 'zip 7z rar tar gz bz2 xz zst cab iso tgz'),
  collection('code', '代码与网页', CodeXml, 'html htm css js jsx ts tsx json xml yaml yml toml ini py rs java cs cpp c h go sh ps1 sql log'),
];

export const customIcon = LibraryBig;
const storageKey = 'association-manager.collections.v1';

export function readCollections() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(value) ? value.filter((item) =>
      typeof item?.id === 'string' && item.id.startsWith('custom-') &&
      typeof item.name === 'string' && Array.isArray(item.extensions)
    ).map((item) => ({ ...item, icon: customIcon })) : [];
  } catch {
    return [];
  }
}

export function saveCollections(items) {
  localStorage.setItem(storageKey, JSON.stringify(items.map(({ id, name, extensions }) => ({ id, name, extensions }))));
}
