import { supabase } from './supabase';
import COS from 'cos-js-sdk-v5';

// ── 存储模式切换 ─────────────────────────────
// cos  = 腾讯云 COS（默认，现有行为）
// local = 本地视频服务器（Windows PC）
const STORAGE_TYPE =
  (import.meta.env.VITE_STORAGE_TYPE || 'local').toLowerCase();

// 本地视频服务器配置（仅 STORAGE_TYPE=local 时生效）
const LOCAL_SERVER_URL =
  import.meta.env.VITE_VIDEO_SERVER_URL || 'https://674d5cc1.r19.cpolar.top';
const LOCAL_SECRET =
  import.meta.env.VITE_VIDEO_SECRET || 'changeme-replace-with-random-string';

// ── COS 配置（仅 STORAGE_TYPE=cos 时使用）──
export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';

// CDN 自定义域名：启用 CDN 加速后改为 'review-system.online'，未配置 CDN 时改为 null
// 改为 null 则继续使用 COS 标准域名（无 CDN 加速，费用较高）
const CDN_DOMAIN = null;  // ⚠️ 未配置 CDN 时必须保持 null，否则视频无法加载

export const BASE_URL = CDN_DOMAIN
  ? `https://${CDN_DOMAIN}`
  : `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

// ── COS 实例缓存 ────────────────────────────────────────
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
  const expiredTime = now + (data?.expire || 7200);
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
  keyExpiredAt = now + (data?.expire || 7200);

  return cosInstance;
}

// ── 预签名 URL 缓存（localStorage + 内存，23h 内不重复请求）───
const _presignCache = new Map();           // 内存缓存（本次 session）
const PRESIGN_LS_PREFIX = 'cos_presign_';
const PRESIGN_MAX_AGE = 23 * 3600 * 1000; // 23h，留 1h 余量

function _getPresignCache(key) {
  // 先查内存
  if (_presignCache.has(key)) {
    const entry = _presignCache.get(key);
    if (Date.now() < entry.expiresAt) return entry.url;
    _presignCache.delete(key);
  }
  // 再查 localStorage
  try {
    const raw = localStorage.getItem(PRESIGN_LS_PREFIX + key);
    if (raw) {
      const entry = JSON.parse(raw);
      if (Date.now() < entry.expiresAt) {
        _presignCache.set(key, entry);
        return entry.url;
      }
      localStorage.removeItem(PRESIGN_LS_PREFIX + key);
    }
  } catch {}
  return null;
}

function _setPresignCache(key, url) {
  const expiresAt = Date.now() + PRESIGN_MAX_AGE;
  const entry = { url, expiresAt };
  _presignCache.set(key, entry);
  try { localStorage.setItem(PRESIGN_LS_PREFIX + key, JSON.stringify(entry)); } catch {}
}

// ── 上传（双模式）────────────────────────────────────────────
export async function uploadToCOS(file, key, onProgress) {
  // ── 本地服务器模式 ──
  if (STORAGE_TYPE === 'local') {
    return uploadToLocal(file, onProgress);
  }

  // ── COS 模式（原逻辑）──
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

// ── 本地服务器上传 ──────────────────────────────────────
async function uploadToLocal(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        resolve({ key: data.fileId, url: data.url });
      } else {
        reject(new Error('上传失败: ' + xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new Error('上传失败，请检查本地服务器是否在线'));
    xhr.open('POST', `${LOCAL_SERVER_URL}/upload?secret=${LOCAL_SECRET}`);
    xhr.send(formData);
  });
}

// ── 获取观看 URL（双模式）────────────────────────────
export async function getPresignedUrl(key) {
  // ── 本地服务器模式 ──
  if (STORAGE_TYPE === 'local') {
    return getLocalVideoUrl(key);
  }

  // ── COS 模式（原逻辑 + 缓存）──
  const cached = _getPresignCache(key);
  if (cached) {
    console.log('[cache] 预签名 URL 缓存命中:', key.substring(0, 30) + '...');
    return cached;
  }

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
        if (CDN_DOMAIN) {
          url = url.replace(
            `${BUCKET}.cos.${REGION}.myqcloud.com`,
            CDN_DOMAIN
          );
        }
        _setPresignCache(key, url);
        console.log('预签名 URL 已生成:', key.substring(0, 30) + '...', 'CDN:', !!CDN_DOMAIN);
        resolve(url);
      }
    });
  });
}

// ── 本地服务器：获取带 token 的视频 URL ──────────────────────
async function getLocalVideoUrl(fileId) {
  // 先查内存缓存
  const memKey = `local_${fileId}`;
  if (_presignCache.has(memKey)) {
    const entry = _presignCache.get(memKey);
    if (Date.now() < entry.expiresAt) return entry.url;
    _presignCache.delete(memKey);
  }

  // 调用本地服务器获取 token
  const res = await fetch(`${LOCAL_SERVER_URL}/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId }),
  });

  if (!res.ok) throw new Error('获取播放 token 失败');
  const { token } = await res.json();
  const url = `${LOCAL_SERVER_URL}/video/${fileId}?token=${token}`;

  _presignCache.set(memKey, { url, expiresAt: Date.now() + PRESIGN_MAX_AGE });
  return url;
}

// ── 删除（双模式）─────────────────────────────────────
export async function deleteFromCOS(key) {
  // ── 本地服务器模式 ──
  if (STORAGE_TYPE === 'local') {
    const res = await fetch(
      `${LOCAL_SERVER_URL}/video/${key}?secret=${LOCAL_SECRET}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error('本地服务器删除失败');
    return { success: true };
  }

  // ── COS 模式（原逻辑）──
  const cos = await getCOSInstance();

  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket:   BUCKET,
      Region:  REGION,
      Key:     key,
    }, (err) => {
      if (err) reject(err);
      else resolve({ success: true });
    });
  });
}
