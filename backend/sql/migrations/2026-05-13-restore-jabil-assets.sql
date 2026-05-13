-- =============================================================================
-- Data Restoration: Jabil Demo Assets
-- Date: 2026-05-13
-- Description:
--   Restores 4 previously deleted technical assets for the Jabil company.
--   Uses ON CONFLICT DO NOTHING so re-running is safe.
-- =============================================================================

DO $$
DECLARE
  v_company_id BIGINT;
BEGIN
  -- Resolve Jabil company id
  SELECT id INTO v_company_id FROM companies WHERE company_name = 'Jabil' LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Company "Jabil" not found – skipping asset restoration.';
    RETURN;
  END IF;

  -- Insert assets (skip if asset_unique_id already exists for this company)
  INSERT INTO assets (company_id, department_id, asset_name, asset_unique_id, asset_type, building, floor, room, status)
  VALUES
    (v_company_id, NULL, 'ECG machine',       '561465', 'technical', 'Main Building', '5',         'ECG room',     'Active'),
    (v_company_id, NULL, 'MRI machine',        '3419',   'technical', 'Main Building', '2',         'MRI room',     'Active'),
    (v_company_id, NULL, 'Ultrasound machine', '45754',  'technical', 'Main Building', '1',         'ultrasound room', 'Active'),
    (v_company_id, NULL, 'X-ray machine',      '026574', 'technical', 'Block A',       '2nd Floor', 'Room 0343',    'Active')
  ON CONFLICT DO NOTHING;

  -- Ensure asset_details rows exist for each newly inserted asset
  INSERT INTO asset_details (asset_id, metadata, documents)
  SELECT a.id, '{}'::jsonb, NULL
  FROM   assets a
  WHERE  a.company_id = v_company_id
    AND  a.asset_unique_id IN ('561465', '3419', '45754', '026574')
  ON CONFLICT (asset_id) DO NOTHING;

  RAISE NOTICE 'Jabil asset restoration complete.';
END;
$$;
