import COS from 'cos-js-sdk-v5';
import { supabase } from './supabase';

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

let cosInstance = null;

/**
 * 从 Supabase 读取 COS 配置并初始化 SDK
 */
async function getCOS() {
  if (cosInstance) return cosInstance;

  const { data, error } = await supabase
    .from('cos_config')
    .select('secret_id, secret_key')
    .single();

  if (error || !data) {
    throw new Error('获取存储配置失败');
  }

  cosInstance = new COS({
    SecretId: data.secret_id,
    SecretKey: data.secret_key,
  });

  return cosInstance;
}

/**
 * Upload file to COS
 */
export async function uploadToCOS(file, key, onProgress) {
  const cos = await getCOS();
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: file,
        onProgress: (info) => {
          if (onProgress) {
            onProgress(Math.round(info.percent * 100));
          }
        },
      },
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            key,
            url: `${BASE_URL}/${key}`,
            location: data.Location,
          });
        }
      }
    );
  });
}

/**
 * Get pre-signed URL for private video (valid for 24 hours)
 */
export async function getPresignedUrl(key) {
  const cos = await getCOS();
  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Sign: true,
        Expires: 86400,
      },
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.Url);
        }
      }
    );
  });
}

/**
 * Delete file from COS
 */
export async function deleteFromCOS(key) {
  const cos = await getCOS();
  return new Promise((resolve, reject) => {
    cos.deleteObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });
}
