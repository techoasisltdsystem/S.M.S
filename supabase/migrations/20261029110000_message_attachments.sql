-- Files and images in messages. A file belongs to one message and can be opened only by the people in
-- that conversation (and never once the message is hidden by moderation). Like every upload here it is
-- checked for size, name and true file type, stored in the database, and reached only through functions.
CREATE TABLE public.message_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE RESTRICT,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0),
  sha256 BYTEA NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, uploaded_by) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_message_files_message ON public.message_files (message_id);
CREATE INDEX idx_message_files_conversation ON public.message_files (conversation_id);
ALTER TABLE public.message_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_files FROM anon, authenticated;

-- Attach one file to a message you just sent (within ten minutes, at most five files, 5 MB each).
CREATE OR REPLACE FUNCTION public.attach_message_file(_message UUID, _name TEXT, _b64 TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.messages;
  data BYTEA;
  chk RECORD;
  fid UUID;
BEGIN
  SELECT * INTO m FROM public.messages WHERE id = _message;
  IF NOT FOUND OR m.sender_id IS DISTINCT FROM public.my_profile_id(m.school_id) OR NOT public.is_participant(m.conversation_id) THEN
    RAISE EXCEPTION 'message not found' USING ERRCODE = '42501';
  END IF;
  IF m.hidden_at IS NOT NULL OR m.created_at < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'files can only be added to a message you have just sent' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.message_files WHERE message_id = m.id) >= 5 THEN
    RAISE EXCEPTION 'a message can carry at most 5 files' USING ERRCODE = '54000';
  END IF;
  data := public.decode_upload(_b64, 5);
  SELECT * INTO chk FROM public.check_upload(_name, data, ARRAY['png', 'jpg', 'pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv'], 5);
  INSERT INTO public.message_files (school_id, conversation_id, message_id, uploaded_by, file_name, mime, size_bytes, sha256, content)
  VALUES (m.school_id, m.conversation_id, m.id, m.sender_id, chk.clean_name, chk.mime, length(data), sha256(data), data) RETURNING id INTO fid;
  RETURN fid;
END $$;

-- The files in a conversation, without their contents.
CREATE OR REPLACE FUNCTION public.message_files_of(_conversation UUID)
RETURNS TABLE (message_id UUID, file_id UUID, file_name TEXT, mime TEXT, size_bytes INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_participant(_conversation) THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT f.message_id, f.id, f.file_name, f.mime, f.size_bytes
    FROM public.message_files f JOIN public.messages m ON m.id = f.message_id
   WHERE f.conversation_id = _conversation AND m.hidden_at IS NULL ORDER BY f.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.get_message_file(_file UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.message_files;
BEGIN
  SELECT * INTO f FROM public.message_files WHERE id = _file;
  IF NOT FOUND OR NOT public.is_participant(f.conversation_id)
     OR EXISTS (SELECT 1 FROM public.messages m WHERE m.id = f.message_id AND m.hidden_at IS NOT NULL) THEN
    RAISE EXCEPTION 'file not found' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('name', f.file_name, 'mime', f.mime, 'size', f.size_bytes, 'content', encode(f.content, 'base64'));
END $$;

REVOKE EXECUTE ON FUNCTION public.attach_message_file(UUID, TEXT, TEXT), public.message_files_of(UUID), public.get_message_file(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_message_file(UUID, TEXT, TEXT), public.message_files_of(UUID), public.get_message_file(UUID) TO authenticated;
