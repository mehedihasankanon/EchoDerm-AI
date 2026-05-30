import psycopg2
import getpass
import sys

# The exact SQL we need to run
SQL_QUERY = """
-- Create the docs configuration table
CREATE TABLE IF NOT EXISTS docs_config (
  id TEXT PRIMARY KEY DEFAULT 'config',
  is_public BOOLEAN DEFAULT false,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  team_members JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies and Permissions
ALTER TABLE docs_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for docs_config" ON docs_config;
CREATE POLICY "Allow all for docs_config" ON docs_config FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions to roles (needed for REST API inserts)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.docs_config TO anon, authenticated, service_role;

-- Insert default row if not exists
INSERT INTO docs_config (id, is_public) VALUES ('config', false) ON CONFLICT DO NOTHING;

-- Force API cache reload
NOTIFY pgrst, 'reload schema';
"""

def main():
    print("🚀 EchoDerm AI — Docs Module SQL Setup 🚀")
    print("Please enter your exact Supabase Postgres Connection String (URI).")
    print("Format: postgresql://postgres.[project]:[password]@aws-0-....pooler.supabase.com:6543/postgres")
    
    uri = input("Postgres URI: ").strip()
    
    if not uri.startswith("postgres"):
        print("Invalid URI. Must start with postgresql:// or postgres://")
        sys.exit(1)
        
    print("\nConnecting to database...")
    try:
        conn = psycopg2.connect(uri)
        conn.autocommit = True
        cursor = conn.cursor()
        
        print("Executing SQL query...")
        cursor.execute(SQL_QUERY)
        
        print("✅ SQL execution successful! Table `docs_config` created and API cache reloaded.")
        
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"\n❌ Error executing SQL: {e}")

if __name__ == "__main__":
    main()
