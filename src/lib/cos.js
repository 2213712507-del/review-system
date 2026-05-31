import { supabase } from './supabase';
import COS from 'cos-js-sdk-v5';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

// ── 临时密钥缓存 ─────────────────────────────────────────────────────
let cosInstance = null;
let tokenExpiredAt = 0;

async function getCOSInstance() {
  const now = Math.floor(Date.now() / 1000);
  // 提前 5 分钟刷新
  if (cosInstance && now < tokenExpiredAt - 300) {
    return cosInstance;
  }

  // 从 Edge Function 获取临时密钥
  const { data, error } = await supabase.functions.invoke('cos-upload');
  if (error || data?.error) {
    throw new Error(error?.message || data?.error || '获取上传凭证失败');
  }

  cosInstance = new COS({
    getAuthorization: (options, callback) => {
      callback({
        TmpSecretId:  data.tmpSecretId,
        TmpSecretKey:  data.tmpSecretKey,
        XCosSecurityToken: data.token,
        ExpiredTime:    data.expiredTime,
      });
    },
  });
  tokenExpiredAt = data.expiredTime;

  return cosInstance;
}

// ── 上传 ─────────────────────────────────────────────────────────────
export async function uploadToCOS(file, key, onProgress) {
  const cos = await getCOSInstance();

  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket:  BUCKET,
      Region:   REGION,
      Key:      key,
      Body:     file,
      ContentType: file.type || 'application/octet-stream',
      onTaskReady: (taskId) => { /* 可记录 taskId 用于取消 */ },
      onProgress: (progressData) => {
        if (onProgress && progressData.total) {
          const pct = Math.round(progressData.loaded / progressData.total * 100);
          onProgress(pct);
        }
      },
    }, (err, data) => {
      if (err) {
        console.error('COS 上传失败:', err);
        reject(new Error(`上传失败: ${err.message || err.code || '未知错误'}`));
      } else {
        if (onProgress) onProgress(100);
        resolve({ key, url: `${BASE_URL}/${key}` });
      }
    });
  });
}

// ── 获取观看 URL ────────────────────────────────────────────────────
export async function getPresignedUrl(key) {
  const cos = await getCOSInstance();

  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket: BUCKET,
      Region:  REGION,
      Key:     key,
      Sign:    true,
      Expires: 86400,  // 24 小时
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data.Url);
    });
  });
}

// ── 删除 ─────────────────────────────────────────────────────────────
export async function deleteFromCOS(key) {
  const cos = await getCOSInstance();

  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket: BUCKET,
      Region:  REGION,
      Key:     key,
    }, (err) => {
      if (err) reject(err);
      else resolve({ success: true });
    });
  });
}
