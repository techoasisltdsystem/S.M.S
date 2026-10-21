-- Statutory payroll deductions (Ghana PAYE and SSNIT, editable per school), the bank payment file for an approved
-- payroll, and pictures in CBT questions. Equations are written in the question text as $...$ and drawn by the browser.

-- ---------------------------------------------------------------------------------------------
-- PAYE and SSNIT
-- ---------------------------------------------------------------------------------------------
-- Bands are monthly and cumulative: each band taxes income up to "upto" at "rate" percent; the last band has no limit.
-- The defaults are the GRA resident monthly bands; a school updates them here when GRA changes them.
CREATE TABLE public.payroll_tax_settings (
  school_id UUID NOT NULL PRIMARY KEY REFERENCES public.schools (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ssnit_employee_pct NUMERIC(5,2) NOT NULL DEFAULT 5.5 CHECK (ssnit_employee_pct BETWEEN 0 AND 50),
  ssnit_employer_pct NUMERIC(5,2) NOT NULL DEFAULT 13 CHECK (ssnit_employer_pct BETWEEN 0 AND 50),
  bands JSONB NOT NULL DEFAULT '[{"upto":490,"rate":0},{"upto":600,"rate":5},{"upto":730,"rate":10},{"upto":3896.67,"rate":17.5},{"upto":19896.67,"rate":25},{"upto":50416.67,"rate":30},{"upto":null,"rate":35}]',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.payroll_tax_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_tax_settings FROM PUBLIC, anon, authenticated;

ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS ssnit NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS paye NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS employer_ssnit NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.payroll_paye(_taxable NUMERIC, _bands JSONB)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE b JSONB; lower NUMERIC := 0; upper NUMERIC; tax NUMERIC := 0;
BEGIN
  IF _taxable IS NULL OR _taxable <= 0 THEN RETURN 0; END IF;
  FOR b IN SELECT * FROM jsonb_array_elements(_bands) LOOP
    upper := NULLIF(b ->> 'upto', '')::numeric;
    IF upper IS NULL OR _taxable <= upper THEN
      RETURN round(tax + (_taxable - lower) * (b ->> 'rate')::numeric / 100, 2);
    END IF;
    tax := tax + (upper - lower) * (b ->> 'rate')::numeric / 100;
    lower := upper;
  END LOOP;
  RETURN round(tax, 2);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_check_bands(_bands JSONB)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE b JSONB; prev NUMERIC := 0; n INT := 0; total INT;
BEGIN
  IF jsonb_typeof(_bands) <> 'array' OR jsonb_array_length(_bands) NOT BETWEEN 1 AND 15 THEN RAISE EXCEPTION 'give between 1 and 15 tax bands' USING ERRCODE = '22023'; END IF;
  total := jsonb_array_length(_bands);
  FOR b IN SELECT * FROM jsonb_array_elements(_bands) LOOP
    n := n + 1;
    IF (b ->> 'rate') IS NULL OR (b ->> 'rate')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'each band needs a rate between 0 and 100' USING ERRCODE = '22023'; END IF;
    IF n < total THEN
      IF NULLIF(b ->> 'upto', '') IS NULL OR (b ->> 'upto')::numeric <= prev THEN RAISE EXCEPTION 'band limits must go up' USING ERRCODE = '22023'; END IF;
      prev := (b ->> 'upto')::numeric;
    ELSIF NULLIF(b ->> 'upto', '') IS NOT NULL THEN
      RAISE EXCEPTION 'the last band must have no upper limit' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_tax_settings_get(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.payroll_tax_settings;
BEGIN
  IF NOT (public.has_permission(_school, 'payroll.manage') OR public.has_permission(_school, 'payroll.approve')) THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.payroll_tax_settings WHERE school_id = _school;
  IF NOT FOUND THEN s := ROW(_school, FALSE, 5.5, 13, '[{"upto":490,"rate":0},{"upto":600,"rate":5},{"upto":730,"rate":10},{"upto":3896.67,"rate":17.5},{"upto":19896.67,"rate":25},{"upto":50416.67,"rate":30},{"upto":null,"rate":35}]'::jsonb, NULL, NULL)::public.payroll_tax_settings; END IF;
  RETURN jsonb_build_object('enabled', s.enabled, 'ssnit_employee_pct', s.ssnit_employee_pct, 'ssnit_employer_pct', s.ssnit_employer_pct, 'bands', s.bands, 'updated_at', s.updated_at);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_tax_settings_save(_school UUID, _enabled BOOLEAN, _ssnit_employee NUMERIC, _ssnit_employer NUMERIC, _bands JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot change payroll settings' USING ERRCODE = '42501'; END IF;
  PERFORM public.payroll_check_bands(_bands);
  INSERT INTO public.payroll_tax_settings (school_id, enabled, ssnit_employee_pct, ssnit_employer_pct, bands, updated_by, updated_at)
  VALUES (_school, COALESCE(_enabled, FALSE), COALESCE(_ssnit_employee, 5.5), COALESCE(_ssnit_employer, 13), _bands, public.my_profile_id(_school), clock_timestamp())
  ON CONFLICT (school_id) DO UPDATE SET enabled = EXCLUDED.enabled, ssnit_employee_pct = EXCLUDED.ssnit_employee_pct, ssnit_employer_pct = EXCLUDED.ssnit_employer_pct,
    bands = EXCLUDED.bands, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
  PERFORM public.write_audit(_school, 'payroll_run', 'payroll_tax_settings', NULL, 'statutory deductions', jsonb_build_object('enabled', _enabled, 'ssnit_employee', _ssnit_employee, 'bands', jsonb_array_length(_bands)));
END $$;

-- Calculation: employee SSNIT comes off basic salary; PAYE is charged on basic + allowances less employee SSNIT.
DO $$
DECLARE def TEXT;
BEGIN
  def := pg_get_functiondef('public.payroll_run_calculate(uuid)'::regprocedure);
  def := replace(def, 'warnings JSONB := ''[]''; seq INT := 0;',
    'warnings JSONB := ''[]''; seq INT := 0; tx public.payroll_tax_settings; ssnit NUMERIC; paye NUMERIC; er NUMERIC;');
  def := replace(def, 'DELETE FROM public.payslips WHERE run_id = r.id;',
    'DELETE FROM public.payslips WHERE run_id = r.id;
  SELECT * INTO tx FROM public.payroll_tax_settings WHERE school_id = r.school_id AND enabled;');
  def := replace(def, '    SELECT COALESCE(sum(LEAST(a.monthly_deduction, a.balance)), 0) INTO adv',
    '    ssnit := 0; paye := 0; er := 0;
    IF tx.school_id IS NOT NULL THEN
      ssnit := round(pp.basic_salary * tx.ssnit_employee_pct / 100, 2);
      er := round(pp.basic_salary * tx.ssnit_employer_pct / 100, 2);
      paye := public.payroll_paye(pp.basic_salary + allw - ssnit, tx.bands);
      IF ssnit > 0 THEN lines := lines || jsonb_build_object(''kind'', ''statutory'', ''name'', ''SSNIT (employee '' || tx.ssnit_employee_pct || ''%)'', ''amount'', ssnit); END IF;
      IF paye > 0 THEN lines := lines || jsonb_build_object(''kind'', ''statutory'', ''name'', ''PAYE income tax'', ''amount'', paye); END IF;
      ded := ded + ssnit + paye;
    END IF;
    SELECT COALESCE(sum(LEAST(a.monthly_deduction, a.balance)), 0) INTO adv');
  def := replace(def, 'gross, net, lines, bank)', 'gross, net, lines, bank, ssnit, paye, employer_ssnit)');
  def := replace(def, 'public.payroll_mask(pp.account_number) END);',
    'public.payroll_mask(pp.account_number) END, ssnit, paye, er);');
  IF position('payroll_paye' IN def) = 0 OR position('employer_ssnit' IN def) = 0 THEN RAISE EXCEPTION 'payroll_run_calculate did not match the expected text'; END IF;
  EXECUTE def;
END $$;

-- Totals for the statutory returns (PAYE to GRA, SSNIT contributions).
CREATE OR REPLACE FUNCTION public.payroll_statutory_summary(_run UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs;
BEGIN
  SELECT * INTO r FROM public.payroll_runs x WHERE x.id = _run;
  IF NOT FOUND OR NOT (public.has_permission(r.school_id, 'payroll.manage') OR public.has_permission(r.school_id, 'payroll.approve')) THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('period', r.period, 'paye', COALESCE(sum(p.paye), 0), 'ssnit_employee', COALESCE(sum(p.ssnit), 0), 'ssnit_employer', COALESCE(sum(p.employer_ssnit), 0),
    'staff', count(*), 'gross', COALESCE(sum(p.gross), 0), 'net', COALESCE(sum(p.net), 0)) FROM public.payslips p WHERE p.run_id = r.id);
END $$;

-- ---------------------------------------------------------------------------------------------
-- Bank payment file
-- ---------------------------------------------------------------------------------------------
-- Full account numbers leave the database only here, only for an approved or paid payroll, and every export is logged.
CREATE OR REPLACE FUNCTION public.payroll_bank_file(_run UUID)
RETURNS TABLE (staff TEXT, bank_name TEXT, account_name TEXT, account_number TEXT, amount NUMERIC, currency TEXT, payslip TEXT, narration TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs; n INT;
BEGIN
  SELECT * INTO r FROM public.payroll_runs x WHERE x.id = _run;
  IF NOT FOUND OR NOT public.has_permission(r.school_id, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot export payroll' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('approved', 'paid') THEN RAISE EXCEPTION 'approve the payroll before exporting the bank file' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO n FROM public.payslips p WHERE p.run_id = r.id AND p.net > 0;
  PERFORM public.write_audit(r.school_id, 'payroll_run', 'payroll_run', r.id, r.period, jsonb_build_object('step', 'bank_file_exported', 'rows', n));
  RETURN QUERY
    SELECT pf.full_name, pp.bank_name, COALESCE(pp.account_name, pf.full_name), pp.account_number, p.net, p.currency, p.number,
      'Salary ' || r.period
    FROM public.payslips p JOIN public.profiles pf ON pf.id = p.profile_id
    LEFT JOIN public.payroll_profiles pp ON pp.school_id = r.school_id AND pp.profile_id = p.profile_id
    WHERE p.run_id = r.id AND p.net > 0 ORDER BY pf.full_name;
END $$;

REVOKE ALL ON FUNCTION public.payroll_tax_settings_get(UUID), public.payroll_tax_settings_save(UUID, BOOLEAN, NUMERIC, NUMERIC, JSONB),
  public.payroll_statutory_summary(UUID), public.payroll_bank_file(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_tax_settings_get(UUID), public.payroll_tax_settings_save(UUID, BOOLEAN, NUMERIC, NUMERIC, JSONB),
  public.payroll_statutory_summary(UUID), public.payroll_bank_file(UUID), public.payroll_paye(NUMERIC, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- CBT: a picture per question, and importing many questions at once
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.cbt_questions ADD COLUMN IF NOT EXISTS image TEXT CHECK (image IS NULL OR (image ~ '^data:image/(png|jpeg|gif|webp);base64,' AND length(image) <= 700000));
ALTER TABLE public.cbt_test_questions ADD COLUMN IF NOT EXISTS image TEXT;

CREATE OR REPLACE FUNCTION public.cbt_question_set_image(_id UUID, _image TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.cbt_questions;
BEGIN
  SELECT * INTO q FROM public.cbt_questions WHERE id = _id;
  IF NOT FOUND OR NOT (q.created_by = public.my_profile_id(q.school_id) OR public.has_permission(q.school_id, 'cbt.manage')) THEN RAISE EXCEPTION 'you cannot edit this question' USING ERRCODE = '42501'; END IF;
  IF _image IS NOT NULL AND (_image !~ '^data:image/(png|jpeg|gif|webp);base64,' OR length(_image) > 700000) THEN
    RAISE EXCEPTION 'the picture must be a PNG, JPEG, GIF or WebP under about 500 KB' USING ERRCODE = '22023';
  END IF;
  UPDATE public.cbt_questions SET image = _image WHERE id = _id;
END $$;

-- Rows are {subject_id, kind, prompt, options, correct, marks, difficulty}. All rows go in or none do, and the error names the row.
CREATE OR REPLACE FUNCTION public.cbt_questions_import(_school UUID, _rows JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE x JSONB; i INT := 0;
BEGIN
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN RAISE EXCEPTION 'the file has no questions' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(_rows) > 500 THEN RAISE EXCEPTION 'import at most 500 questions at a time' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    i := i + 1;
    BEGIN
      PERFORM public.cbt_question_save(_school, NULL, (x ->> 'subject_id')::uuid, x ->> 'kind', x ->> 'prompt', COALESCE(x -> 'options', '[]'), x -> 'correct',
        NULLIF(x ->> 'marks', '')::numeric, NULLIF(x ->> 'difficulty', ''));
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'row %: %', i, SQLERRM USING ERRCODE = SQLSTATE;
    END;
  END LOOP;
  PERFORM public.write_audit(_school, 'cbt_test_saved', 'cbt_question', NULL, 'question import', jsonb_build_object('imported', i));
  RETURN i;
END $$;

REVOKE ALL ON FUNCTION public.cbt_question_set_image(UUID, TEXT), public.cbt_questions_import(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_question_set_image(UUID, TEXT), public.cbt_questions_import(UUID, JSONB) TO authenticated;

-- Carry the picture through: bank list, test snapshot, the student's paper and the marker's review.
DROP FUNCTION IF EXISTS public.cbt_questions_list(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.cbt_questions_list(_school UUID, _subject UUID DEFAULT NULL, _search TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, subject_id UUID, subject TEXT, kind TEXT, prompt TEXT, options JSONB, correct JSONB, marks NUMERIC, difficulty TEXT, created_by TEXT, mine BOOLEAN, used INT, image TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_cbt(_school, NULL, NULL) THEN RAISE EXCEPTION 'question banks are for teachers' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT q.id, q.subject_id, s.name, q.kind, q.prompt, q.options, q.correct, q.marks, q.difficulty, p.full_name, q.created_by = public.my_profile_id(_school),
      (SELECT count(*)::int FROM public.cbt_test_questions tq WHERE tq.question_id = q.id), q.image
    FROM public.cbt_questions q JOIN public.subjects s ON s.id = q.subject_id LEFT JOIN public.profiles p ON p.id = q.created_by
    WHERE q.school_id = _school AND NOT q.archived AND (_subject IS NULL OR q.subject_id = _subject)
      AND public.can_manage_cbt(_school, NULL, q.subject_id)
      AND (_search IS NULL OR q.prompt ILIKE '%' || _search || '%')
    ORDER BY q.created_at DESC LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION public.cbt_questions_list(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_questions_list(UUID, UUID, TEXT) TO authenticated;

DO $$
DECLARE def TEXT; sig TEXT;
BEGIN
  SELECT p.oid::regprocedure::text INTO sig FROM pg_proc p WHERE p.proname = 'cbt_test_save' AND p.pronamespace = 'public'::regnamespace;
  def := pg_get_functiondef(sig::regprocedure);
  def := replace(def, 'INSERT INTO public.cbt_test_questions (test_id, question_id, position, kind, prompt, options, correct, marks) VALUES (rid, q.id, i, q.kind, q.prompt, q.options, q.correct, q.marks);',
                      'INSERT INTO public.cbt_test_questions (test_id, question_id, position, kind, prompt, options, correct, marks, image) VALUES (rid, q.id, i, q.kind, q.prompt, q.options, q.correct, q.marks, q.image);');
  IF position('q.image' IN def) = 0 THEN RAISE EXCEPTION 'cbt_test_save did not match the expected text'; END IF;
  EXECUTE def;

  def := pg_get_functiondef('public.cbt_attempt_payload(uuid)'::regprocedure);
  def := replace(def, '''options'', q.options, ''marks'', q.marks)', '''options'', q.options, ''marks'', q.marks, ''image'', q.image)');
  IF position('q.image' IN def) = 0 THEN RAISE EXCEPTION 'cbt_attempt_payload did not match the expected text'; END IF;
  EXECUTE def;

  def := pg_get_functiondef('public.cbt_attempt_review(uuid)'::regprocedure);
  def := replace(def, '''answer'', a.answers -> q.id::text)', '''answer'', a.answers -> q.id::text, ''image'', q.image)');
  IF position('q.image' IN def) = 0 THEN RAISE EXCEPTION 'cbt_attempt_review did not match the expected text'; END IF;
  EXECUTE def;
END $$;
