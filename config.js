/* =========================================================
   Conexión con Supabase y Cloudflare Turnstile
   Todos estos valores son públicos: están pensados para ir en el navegador.
   NUNCA pongas aquí la clave "service_role"/"secret" de Supabase
   ni la "Secret Key" de Turnstile (esas van en Supabase → Edge Functions → Secrets).

     · supabaseUrl: Project URL (Project Settings → API)
     · supabaseKey: clave pública "anon" o "publishable"
     · turnstileSiteKey: "Site Key" del widget de Turnstile (Cloudflare)

   Sin datos de Supabase la página funciona en modo demostración.
   Sin turnstileSiteKey las reservas funcionan, pero sin captcha.
   ========================================================= */
window.AURORA_CONFIG = {
  supabaseUrl: "https://ihnbptnlcaqvustnzlop.supabase.co",
  supabaseKey: "sb_publishable_nWuDog0CHR4vWkFlV1v0vA_VjXfG4s_",
  turnstileSiteKey: "0x4AAAAAAFKvpGguHd68k16F",
};
