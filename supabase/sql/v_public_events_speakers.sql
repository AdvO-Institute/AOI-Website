-- Monthly Huddle instructors come from the event (#135): the public events view
-- gains two columns at the end, speakers and sessions. Every existing column stays
-- as it was, in the same order (copied from the live definition, 2026-10-23).
-- Speaker notes and person_id are deliberately left out. The view runs as its
-- owner, as before, so the public key can read these without a new policy.

create or replace view public.v_public_events as
 select id,
    slug,
    title,
    subtitle,
    category,
    description,
    starts_at,
    ends_at,
    timezone,
    location,
    primary_image,
    social_image,
    price,
    early_bird,
    early_bird_price,
    early_bird_until,
    capacity,
    video_url,
    ce_credits,
    member_price,
    free_with_membership,
    reg_opens,
    reg_closes,
        case
            when capacity is null then null::integer
            else greatest(0::bigint, capacity - (( select count(*) as count
               from event_registrations r
              where r.event_id = e.id and coalesce(r.registration_status, ''::text) <> 'cancelled'::text)))::integer
        end as seats_remaining,
    student_price,
    faculty_free,
    event_type,
    agenda,
    prerequisites,
    refund_policy,
    room_block_hotel,
    room_block_rate,
    room_block_by,
    gallery_images,
    location_id,
    audience,
    ce_school,
    ce_mode,
    ce_price,
    ( select coalesce(json_agg(json_build_object(
                'name', sp.name, 'speaker_title', sp.speaker_title,
                'is_keynote', sp.is_keynote, 'sort', sp.sort) order by sp.sort), '[]'::json)
        from event_speakers sp where sp.event_id = e.id) as speakers,
    ( select coalesce(json_agg(json_build_object(
                'title', ss.title, 'starts_at', ss.starts_at,
                'speaker', ss.speaker, 'sort', ss.sort) order by ss.sort, ss.starts_at), '[]'::json)
        from event_sessions ss where ss.event_id = e.id) as sessions
   from events e
  where status = 'published'::text and coalesce(visibility, 'public'::text) = 'public'::text;

notify pgrst, 'reload schema';
