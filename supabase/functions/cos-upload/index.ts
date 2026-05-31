// Supabase Edge Function: 返回 COS STS 临时密钥
// 前端用临时密钥 + cos-js-sdk-v5 直传 COS（SDK 自己签签名，100% 正确）

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const SECRET_ID  = Deno.env.get("COS_SECRET_ID")!;
const SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;
const BUCKET     = "review-videos-1438185079";
const APPID      = "1438185079";
const REGION     = "ap-beijing";

// ── 腾讯云 API v3 签名 ───────────────────────────────────────────────────
function signTC3(secretId: string, secretKey: string, host: string, payload: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  // 1. 拼接规范请求串
  const hashedPayload = createHmac("sha256", "")
    .update(payload)
    .digest("hex");
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:application/json; charset=utf-8`,
    `host:${host}`,
    "",
    "content-type;host",
    hashedPayload,
  ].join("\n");

  // 2. 拼接待签名字符串
  const credentialScope = `${date}/sts/tc3_request`;
  const hashedCanonical = createHmac("sha256", "")
    .update(canonicalRequest)
    .digest("hex");
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    hashedCanonical,
  ].join("\n");

  // 3. 计算签名
  const kDate    = createHmac("sha256", `TC3${secretKey}`).update(date).digest();
  const kService = createHmac("sha256", kDate).update("sts").digest();
  const kSigning = createHmac("sha256", kService).update("tc3_request").digest();
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  // 4. Authorization
  const authorization = [
    "TC3-HMAC-SHA256",
    `Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=content-type;host`,
    `Signature=${signature}`,
  ].join(", ");

  return { authorization, timestamp };
}

// ── COS 资源 ARN ────────────────────────────────────────────────────────
const RESOURCE = `qcs::cos:${REGION}:uid/${APPID}:${BUCKET}/*`;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body   = await req.json().catch(() => ({}));
    const expire  = body.expire ?? 7200;   // 默认 2 小时

    // STS policy：只允许操作当前 bucket
    const policy = JSON.stringify({
      version: "2.0",
      statement: [{
        effect:  "allow",
        action:  ["name/cos:PutObject", "name/cos:DeleteObject", "name/cos:GetObject"],
        resource: [RESOURCE],
      }],
    });

    const payload = JSON.stringify({
      Name:             "review-system",
      Policy:            policy,
      DurationSeconds:   expire,
    });

    const host = "sts.tencentcloudapi.com";
    const { authorization, timestamp } = signTC3(SECRET_ID, SECRET_KEY, host, payload);

    const stsRes = await fetch(`https://${host}`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Host":          host,
        "Authorization":  authorization,
        "X-TC-Action":   "GetFederationToken",
        "X-TC-Version":  "2018-08-13",
        "X-TC-Region":   REGION,
        "X-TC-Timestamp": String(timestamp),
      },
      body: payload,
    });

    const stsData = await stsRes.json();
    const cred = stsData?.Response?.Credentials;
    if (!cred) {
      console.error("STS 返回异常:", JSON.stringify(stsData));
      throw new Error(stsData?.Response?.Error?.Message || "获取临时密钥失败");
    }

    return new Response(JSON.stringify({
      tmpSecretId:  cred.TmpSecretId,
      tmpSecretKey:  cred.TmpSecretKey,
      token:         cred.Token,
      expiredTime:   stsData.Response.ExpiredTime,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Edge Function 错误:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
