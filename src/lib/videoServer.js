/**
 * 本地视频服务器配置
 * 取代腾讯云 COS，视频存储在本机硬盘
 */

// Cloudflare Tunnel 公网地址（部署后填入）
export const VIDEO_SERVER_URL =
  import.meta.env.VITE_VIDEO_SERVER_URL ||
  'https://video-review-system.your-tunnel.com';

// 和 video-server/server.js 里的 SECRET 保持一致
export const VIDEO_SECRET =
  import.meta.env.VITE_VIDEO_SECRET ||
  'changeme-replace-with-random-string';

/**
 * 生成 presign token（23h 有效）
 * 每次播放视频前调用，把 token 拼到 URL 后面
 */
export async function getVideoToken(fileId, expiresIn = 23 * 3600) {
  const res = await fetch(`${VIDEO_SERVER_URL}/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, expiresIn }),
  });
  if (!res.ok) throw new Error('获取播放 token 失败');
  const { token } = await res.json();
  return token;
}

/**
 * 获取带 token 的视频播放 URL
 */
export async function getVideoUrl(fileId) {
  const token = await getVideoToken(fileId);
  return `${VIDEO_SERVER_URL}/video/${fileId}?token=${token}`;
}

/**
 * 上传视频到本地服务器
 */
export async function uploadVideo(file, onProgress) {
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
        resolve({ fileId: data.fileId, url: data.url });
      } else {
        reject(new Error('上传失败: ' + xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new Error('上传失败，请检查网络'));
    xhr.open('POST', `${VIDEO_SERVER_URL}/upload?secret=${VIDEO_SECRET}`);
    xhr.send(formData);
  });
}
