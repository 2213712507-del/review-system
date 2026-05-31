import { supabase } from './supabase';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke('cos-upload', { body });
  if (error) {
    // 尝试提取 Edge Function 返回的详细错误
    const detail = error?.context?.statusText || error?.message || '请求失败';
    throw new Error(`Edge Function: ${detail}`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * Upload file to COS（通过 Edge Function 代理上传）
 */
export async function uploadToCOS(file, key, onProgress) {
  // 读取文件为 base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // 去掉 data:video/mp4;base64, 前缀
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  if (onProgress) onProgress(10);

  const { success, publicUrl, error: errMsg } = await callFunction({
    key,
    contentType: file.type,
    fileBase64: base64,
  });

  if (!success) {
    throw new Error(errMsg || '上传失败');
  }

  if (onProgress) onProgress(100);

  return { key, url: publicUrl };
}

/**
 * Get public URL for viewing video（bucket 设为公有读后无需签名）
 */
export async function getPresignedUrl(key) {
  return `${BASE_URL}/${key}`;
}

/**
 * Delete file from COS（通过 Edge Function 代理删除）
 */
export async function deleteFromCOS(key) {
  const { success } = await callFunction({ key, action: 'delete' });
  if (!success) throw new Error('删除失败');
  return { success: true };
}
