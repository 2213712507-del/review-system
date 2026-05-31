import { supabase } from './supabase';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

/**
 * 调用 Edge Function（统一错误处理）
 */
async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke('cos-upload', { body });
  if (error) {
    // Supabase Edge Function 错误可能包含 context 或直接是字符串
    let detail = '请求失败';
    if (typeof error === 'string') detail = error;
    else if (error?.message) detail = error.message;
    else if (error?.context?.statusText) detail = error.context.statusText;
    else if (error?.error) detail = error.error;
    throw new Error(`Edge Function: ${detail}`);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * 上传文件到 COS（预签名 URL 直传，支持大文件）
 * 步骤：
 *   1. 调用 Edge Function 获取预签名 uploadUrl + auth
 *   2. 前端直接用 PUT 上传到该 URL（带 Authorization header）
 */
export async function uploadToCOS(file, key, onProgress) {
  // ① 获取预签名 URL
  const { uploadUrl, auth } = await callFunction({ key });
  if (onProgress) onProgress(5);

  // ② PUT 直传到 COS（支持任意大小文件）
  const xhr = new XMLHttpRequest();
  await new Promise((resolve, reject) => {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        // 5% 已用掉（拿到URL），剩余 95% 给实际上传
        onProgress(5 + Math.round((e.loaded / e.total) * 95));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`COS上传失败: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('COS上传网络错误'));
    xhr.ontimeout = () => reject(new Error('COS上传超时'));
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Authorization', auth);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });

  if (onProgress) onProgress(100);
  return { key, url: `${BASE_URL}/${key}` };
}

/**
 * 获取视频观看 URL（通过 Edge Function 生成带签名的临时 URL）
 */
export async function getPresignedUrl(key) {
  const { url } = await callFunction({ key, action: 'view' });
  return url;
}

/**
 * 从 COS 删除文件（通过 Edge Function 代理）
 */
export async function deleteFromCOS(key) {
  const { auth, method } = await callFunction({ key, action: 'delete' });

  const res = await fetch(`${BASE_URL}/${encodeURIComponent(key)}`, {
    method,
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
  return { success: true };
}
