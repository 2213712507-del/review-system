import { supabase } from './supabase';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

/**
 * 通过 Supabase Edge Function 获取 COS 预签名上传 URL
 * 密钥仅存于服务端，前端不接触
 */
async function getUploadSignature(key, contentType) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(
    'https://brqiryhudyopxarhfbgd.supabase.co/functions/v1/cos-upload',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key, contentType }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '获取上传签名失败');
  }

  return res.json();
}

/**
 * Upload file to COS（前端直接用预签名 URL PUT，密钥不经过浏览器）
 */
export async function uploadToCOS(file, key, onProgress) {
  const { uploadUrl, authorization, publicUrl } = await getUploadSignature(
    key,
    file.type
  );

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
 * Get pre-signed URL for viewing video（via Edge Function，24小时有效）
 */
export async function getPresignedUrl(key) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(
    'https://brqiryhudyopxarhfbgd.supabase.co/functions/v1/cos-upload',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key, action: 'view' }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '获取播放链接失败');
  }

  const { url } = await res.json();
  return url;
}

/**
 * Delete file from COS（via Edge Function 签名）
 */
export async function deleteFromCOS(key) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(
    'https://brqiryhudyopxarhfbgd.supabase.co/functions/v1/cos-upload',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key, action: 'delete' }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '删除失败');
  }

  const { deleteUrl, authorization } = await res.json();

  // 用签名 URL 执行删除
  const delRes = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { 'Authorization': authorization },
  });

  if (!delRes.ok) {
    throw new Error('删除失败');
  }

  return { success: true };
}
