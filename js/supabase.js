// Conexão com o Supabase (a anon key é pública por design; a segurança vem do RLS)
const SUPABASE_URL = "https://kkryumgyaeamdfwngmwq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrcnl1bWd5YWVhbWRmd25nbXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNjA4NDAsImV4cCI6MjExMDczNjg0MH0.DEfVCgI_BDZ8OW-GKInYnGxPEoTk_6LlXOGk26dfH-Y";

// "supabase" global vem do script da CDN carregado antes deste arquivo
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
