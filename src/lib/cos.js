import { supabase } from './supabase';
import COS from 'cos-js-sdk-v5';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';

// CDN 自定义域名：启用 CDN 加速后改为 'review-system.online'，未配置 CDN 时改为 null
// 改为 null 则继续使用 COS 标准域名（无 CDN 加速，费用较高）
const CDN_DOMAIN = 'review-system.online';

export const BASE_URL = CDN_DOMAIN
  ? `https://${CDN_DOMAIN}`
  : `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

// ── COS 实例缓存 ─────────────────────────────────────────────────
let cosInstance = null;
let keyExpiredAt = 0;

async function getCOSInstance() {
  const now = Math.floor(Date.now() / 1000);
  if (cosInstance && now < keyExpiredAt - 300) {
    return cosInstance;
  }

  // 从 Edge Function 获取密钥
  const { data, error } = await supabase.functions.invoke('cos-upload');
  if (error || data?.error) {
    console.error('COS 密钥获取失败:', error || data?.error);
    throw new Error(error?.message || data?.error || '获取上传凭证失败');
  }

  // 新版 COS SDK 必须通过 getAuthorization 回调
  // 且需要 SecurityToken、ExpiredTime（10位时间戳）
  const expiredTime = now + (data.expire || 7200);
  cosInstance = new COS({
    getAuthorization: (options, callback) => {
      callback({
        TmpSecretId:  data.secretId,
        TmpSecretKey: data.secretKey,
        SecurityToken: 'none',  // 非空即可（真实密钥不需要 token）
        ExpiredTime:   expiredTime,
      });
    },
  });
  keyExpiredAt = now + (data.expire || 7200);

  return cosInstance;
}

// ── 上传 ────────────────────────────────────────────────────────
export async function uploadToCOS(file, key, onProgress) {
  const cos = await getCOSInstance();

  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket:   BUCKET,
      Region:    REGION,
      Key:       key,
      Body:      file,
      ContentType: file.type || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000',
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

// ── 获取观看 URL（带签名，24小时有效）────────────────────────
export async function getPresignedUrl(key) {
  const cos = await getCOSInstance();

  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket: BUCKET,
      Region:  REGION,
      Key:     key,
      Sign:    true,
      Expires: 86400,
    }, (err, data) => {
      if (err) {
        console.error('预签名 URL 生成失败:', err);
        reject(err);
      } else {
        let url = data.Url;
        // 替换为 CDN 自定义域名，使视频请求经过 CDN 缓存
        if (CDN_DOMAIN) {
          url = url.replace(
            `${BUCKET}.cos.${REGION}.myqcloud.com`,
            CDN_DOMAIN
          );
        }
        console.log('预签名 URL 已生成:', key.substring(0, 30) + '...', 'CDN:', !!CDN_DOMAIN);
        resolve(url);
      }
    });
  });
}

// ── 删除 ────────────────────────────────────────────────────────
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
