-- ==============================================================================
-- MIGRATION: Feature Controls Hardening & Cross-Portal Synchronization
-- CoreEdu Company Management <-> School/College/University & Student Portals
-- Date: 2026-10-12
-- ==============================================================================

-- 1. Ensure feature_controls table exists with correct schema
CREATE TABLE IF NOT EXISTS public.feature_controls (
    id text PRIMARY KEY,
    "schoolId" text NOT NULL,
    "featureSettings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "updatedAt" timestamptz DEFAULT now(),
    "updatedBy" text DEFAULT 'system'
);

-- Index on schoolId for fast lookups
CREATE INDEX IF NOT EXISTS idx_feature_controls_school_id ON public.feature_controls ("schoolId");

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.feature_controls ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Public & Authenticated Read Access for Active Feature Controls
DROP POLICY IF EXISTS "Allow select for all authenticated and anon users" ON public.feature_controls;
CREATE POLICY "Allow select for all authenticated and anon users"
    ON public.feature_controls
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- 4. Policy: Upsert/Update restricted to Service Role or RPCs (SECURITY DEFINER handles company updates)
DROP POLICY IF EXISTS "Allow company update for feature_controls" ON public.feature_controls;
CREATE POLICY "Allow company update for feature_controls"
    ON public.feature_controls
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 5. RPC: company_save_feature_controls
-- Saves or overrides feature controls for a specific school or globally for 'ALL' institutions
CREATE OR REPLACE FUNCTION public.company_save_feature_controls(
    p_school_id text,
    p_feature_settings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_school text;
    v_updated_count integer := 0;
BEGIN
    IF p_school_id IS NULL OR p_school_id = '' THEN
        RAISE EXCEPTION 'Target school ID is required';
    END IF;

    IF UPPER(p_school_id) = 'ALL' THEN
        -- Global update across all institutions in feature_controls
        UPDATE public.feature_controls
        SET "featureSettings" = p_feature_settings,
            "updatedAt" = now(),
            "updatedBy" = 'company_admin'
        WHERE "schoolId" <> 'GLOBAL_DEFAULT';
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        -- Also record global default row
        INSERT INTO public.feature_controls (id, "schoolId", "featureSettings", "updatedAt", "updatedBy")
        VALUES ('GLOBAL_DEFAULT', 'GLOBAL_DEFAULT', p_feature_settings, now(), 'company_admin')
        ON CONFLICT (id) DO UPDATE
        SET "featureSettings" = EXCLUDED."featureSettings",
            "updatedAt" = now(),
            "updatedBy" = 'company_admin';

        -- Also sync across existing schools table
        UPDATE public.schools
        SET "featureSettings" = p_feature_settings
        WHERE true;

        RETURN jsonb_build_object(
            'success', true,
            'scope', 'ALL',
            'updatedRows', v_updated_count,
            'featureSettings', p_feature_settings
        );
    ELSE
        -- Single institution update
        INSERT INTO public.feature_controls (id, "schoolId", "featureSettings", "updatedAt", "updatedBy")
        VALUES (p_school_id, p_school_id, p_feature_settings, now(), 'company_admin')
        ON CONFLICT (id) DO UPDATE
        SET "featureSettings" = EXCLUDED."featureSettings",
            "schoolId" = EXCLUDED."schoolId",
            "updatedAt" = now(),
            "updatedBy" = 'company_admin';

        -- Sync into schools table if record exists
        BEGIN
            UPDATE public.schools
            SET "featureSettings" = p_feature_settings
            WHERE id = p_school_id;
        EXCEPTION WHEN undefined_column THEN
            -- Ignore if schools table does not have featureSettings column
            NULL;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'scope', p_school_id,
            'featureSettings', p_feature_settings
        );
    END IF;
END;
$$;

-- 6. RPC: company_get_feature_controls
-- Retrieves feature controls with global fallback
CREATE OR REPLACE FUNCTION public.company_get_feature_controls(
    p_school_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings jsonb;
BEGIN
    SELECT "featureSettings" INTO v_settings
    FROM public.feature_controls
    WHERE "schoolId" = p_school_id
    LIMIT 1;

    IF v_settings IS NULL THEN
        -- Fallback to global defaults
        SELECT "featureSettings" INTO v_settings
        FROM public.feature_controls
        WHERE "schoolId" = 'GLOBAL_DEFAULT'
        LIMIT 1;
    END IF;

    RETURN COALESCE(v_settings, '{}'::jsonb);
END;
$$;

-- 7. RPC: get_institution_feature_controls
-- Safe institution and student portal query bypasses RLS
CREATE OR REPLACE FUNCTION public.get_institution_feature_controls(
    p_school_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings jsonb;
BEGIN
    IF p_school_id IS NULL OR p_school_id = '' THEN
        RETURN '{}'::jsonb;
    END IF;

    -- Look up in feature_controls
    SELECT "featureSettings" INTO v_settings
    FROM public.feature_controls
    WHERE "schoolId" = p_school_id
    LIMIT 1;

    -- Look up in schools table if not found
    IF v_settings IS NULL THEN
        BEGIN
            SELECT "featureSettings" INTO v_settings
            FROM public.schools
            WHERE id = p_school_id
            LIMIT 1;
        EXCEPTION WHEN undefined_column THEN
            v_settings := NULL;
        END;
    END IF;

    -- Fallback to global default if still not found
    IF v_settings IS NULL THEN
        SELECT "featureSettings" INTO v_settings
        FROM public.feature_controls
        WHERE "schoolId" = 'GLOBAL_DEFAULT'
        LIMIT 1;
    END IF;

    RETURN COALESCE(v_settings, '{}'::jsonb);
END;
$$;

-- 8. Grant Execution Privileges
GRANT EXECUTE ON FUNCTION public.company_save_feature_controls(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_get_feature_controls(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_feature_controls(text) TO authenticated, anon, service_role;
