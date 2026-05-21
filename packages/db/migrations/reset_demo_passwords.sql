-- Reset vendor and hospital demo passwords to Admin@123
-- Hash: $2a$12$asfx28i8Vidv1K.cZIXUFO/kjoa85itbd35.bMeR2K5kZCvGgOin2
UPDATE users
SET
  password_hash = '$2a$12$asfx28i8Vidv1K.cZIXUFO/kjoa85itbd35.bMeR2K5kZCvGgOin2',
  failed_login_attempts = 0,
  locked_until = NULL
WHERE email IN ('vendor@curavend.com', 'hospital@curavend.com');
