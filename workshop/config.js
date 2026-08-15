/* ---------------------------------------------------------------------
   RCK Workshop — site configuration.

   Fill these in once and every phone that opens the app is connected
   automatically, with nothing to type in. Leave them blank and each
   device gets asked for them on first open (Settings screen).

   Get both values from Supabase → your project → Settings → API:
     RCKW_SUPABASE_URL  = "Project URL"
     RCKW_SUPABASE_KEY  = the "anon / public" key  (NOT the service key)
--------------------------------------------------------------------- */
window.RCKW_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',

  // Optional. If set, switching a device into Workshop mode asks for this
  // code first, so crew phones can't close work orders by accident.
  // It is a speed bump, not a password — the code is visible in this file.
  workshopPin: ''
};
