import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

// Configurar via Supabase Dashboard → Settings → Edge Functions → Secrets:
// VAPID_PUBLIC_KEY  = BKlT6oamfZUIhcr9Hio4Z5Gsbay945j3QrhsHp-PJ85N-M3UWJPiCjN3sKk9d-UYHgAl7ohc-xmkJw4yhA0X3GA
// VAPID_PRIVATE_KEY = (chave privada gerada — guarde em local seguro)
// VAPID_SUBJECT     = mailto:chausselicita@gmail.com

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

serve(async (req: Request) => {
  try {
    const body   = await req.json();
    const record = body.record;
    if (!record) return new Response("no record", { status: 400 });

    const salonSlug = record.salon_slug || null;
    const subKey    = salonSlug ? `push-sub-${salonSlug}` : "push-sub";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", subKey)
      .single();

    if (!data?.value) return new Response("no subscription stored", { status: 200 });

    const subscription = JSON.parse(data.value);

    const payload = JSON.stringify({
      title: "📅 Novo Agendamento!",
      body:  `${record.client_name} · ${record.service} às ${record.booking_time}`,
      count: 1
    });

    await webpush.sendNotification(subscription, payload);

    return new Response("push sent", { status: 200 });
  } catch (err) {
    console.error("notify-booking error:", err);
    return new Response(String(err), { status: 500 });
  }
});
