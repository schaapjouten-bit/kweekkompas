-- Apply after the private bucket migration. Safe to repeat; no object changes.
-- Only updates bucket configuration; never alters storage.objects or its owner/RLS.
begin;
do $$
begin
    if not exists (select 1 from storage.buckets where id = 'kweekkompas-photos') then
        raise exception 'Voer eerst 20261003093611_kweekkompas_private_photos.sql uit.';
    end if;
end $$;
update storage.buckets set file_size_limit = 1000000
where id = 'kweekkompas-photos';
commit;
