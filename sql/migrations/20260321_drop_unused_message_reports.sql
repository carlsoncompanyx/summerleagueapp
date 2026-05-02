-- Cleanup unused legacy moderation artifact table not wired in current MVP surfaces.
drop table if exists public.message_reports cascade;
