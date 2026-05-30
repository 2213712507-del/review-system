import { supabase } from './supabase';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

const FN_URL = 'https://brqiryhudyopxarhfbgd.supabase.co/functions/v1/cos-upload';

/**
 * 调用 Edge Function（带 auth token + apikey）
 */
async function callFunction(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    'apikey': 'sb_publishable_5A5J4K_7surYTf6P_iQ0MQ_YkpRGbRs',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '请求失败');
  }

  return res.json();
}

/**
 * Upload file to COS（前端直接用预签名 URL PUT，密钥不经过浏览器）
 */
export async function uploadToCOS(file, key, onProgress) {
  const { uploadUrl, authorization, publicUrl } = await callFunction({
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
    xhr.setRequestHeader('Authorization', authorization);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Get pre-signed URL for viewing video（24小时有效）
 */
export async function getPresignedUrl(key) {
  const { url } = await callFunction({ key, action: 'view' });
  return url;
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

  if (!delRes.ok) {
    throw new Error('删除失败');
  }

  return { success: true };
}
