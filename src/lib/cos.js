import { supabase } from './supabase';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke('cos-upload', { body });
  if (error) throw new Error(error.message || '请求失败');
  return data;
}

/**
 * Upload file to COS（预签名 URL，签名已包含在 URL 中）
 */
export async function uploadToCOS(file, key, onProgress) {
  const { uploadUrl, publicUrl } = await callFunction({
    key,
    contentType: file.type,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve({ key, url: publicUrl });
      } else {
        reject(new Error(`上传失败: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('网络错误')));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Get public URL for viewing video（bucket 设为公有读后无需签名）
 */
export async function getPresignedUrl(key) {
  return `${BASE_URL}/${key}`;
}

/**
 * Delete file from COS
 */
export async function deleteFromCOS(key) {
  const { deleteUrl, authorization } = await callFunction({ key, action: 'delete' });

  const delRes = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { 'Authorization': authorization },
  });

  if (!delRes.ok) throw new Error('删除失败');
  return { success: true };
}
