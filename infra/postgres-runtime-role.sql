-- Review and run with a separate trusted migration/DBA connection.
-- Never run this automatically against an existing shop database.
-- psql -v app_role=milo_runtime -v db_name=milo -f infra/postgres-runtime-role.sql
-- Set the new role password interactively using: \password milo_runtime
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE :"app_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 40;
GRANT CONNECT ON DATABASE :"db_name" TO :"app_role";
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
REVOKE ALL ON TABLE "_prisma_migrations" FROM :"app_role";
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" FROM :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
-- Default privileges apply to objects subsequently created by this migration owner.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";
COMMIT;
-- Re-apply the explicit AuditLog/_prisma_migrations restrictions after migrations.
-- Keep the migration owner credentials out of API/worker environments.
