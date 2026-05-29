import COS from 'cos-js-sdk-v5';

const cos = new COS({
  SecretId: 'AKIDQo14wb3TkpU4SdbP3Yw88vWSL6h5JPK',
  SecretKey: 'oU0UqV4SiojT2QdeU9g1B9ycAZryulYC',
});

export const BUCKET = 'review-videos-1438185079';
export const REGION = 'ap-beijing';
export const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

/**
 * Upload file to COS
 * @param {File} file
 * @param {string} key - path in bucket, e.g. 'project-uuid/date-uuid/video.mp4'
 * @param {function} onProgress
 * @returns {Promise<{key: string, url: string}>}
 */
export function uploadToCOS(file, key, onProgress) {
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
 * @param {string} key
 * @returns {string}
 */
export function getPresignedUrl(key) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Sign: true,
        Expires: 86400, // 24 hours
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
 * @param {string} key
 */
export function deleteFromCOS(key) {
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

export default cos;
