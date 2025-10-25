-- Delete all file areas except the first 5
DELETE FROM file_areas WHERE id > 5;

-- Show remaining file areas
SELECT id, name, conferenceid FROM file_areas ORDER BY id;
