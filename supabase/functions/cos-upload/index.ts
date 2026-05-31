// Supabase Edge Function: 返回 COS 密钥给前端
// 前端用 cos-js-sdk-v5 直传（SDK 内部正确签名）
// 注意：此方案密钥在运行时可被浏览器抓包获取，仅适合低安全需求场景

const COS_SECRET_ID  = Deno.env.get("COS_SECRET_ID")!;
const COS_SECRET_KEY = Deno.env.get("COS_SECRET_KEY")!;

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
    const body = await req.json().catch(() => ({}));
    const expire = body.expire ?? 7200; // 默认 2 小时

    // 直接返回密钥（前端用 COS SDK 自己签名）
    // 注意：这相当于把密钥暴露给前端，但比写死在前端代码里稍好
    return new Response(
      JSON.stringify({
        secretId:  COS_SECRET_ID,
        secretKey: COS_SECRET_KEY,
        expire,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("Edge Function 错误:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
