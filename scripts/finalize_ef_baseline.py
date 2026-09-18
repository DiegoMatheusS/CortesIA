from __future__ import annotations

import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[1]
migrations = root / "cortes-ia-api" / "Migrations"
files = sorted(migrations.glob("*_SliceFlowBaseline.cs"))
if len(files) != 1:
    raise SystemExit(f"expected one SliceFlowBaseline migration, found {len(files)}")

path = files[0]
text = path.read_text(encoding="utf-8-sig")

up_marker = """        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
"""
up_sql = r'''            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION deny_ledger_mutation() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'append only';
                END;
                $$;

                DROP TRIGGER IF EXISTS ledger_immutable ON "Ledger";
                CREATE TRIGGER ledger_immutable
                BEFORE UPDATE OR DELETE ON "Ledger"
                FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();

                DROP TRIGGER IF EXISTS audit_immutable ON "Audit";
                CREATE TRIGGER audit_immutable
                BEFORE UPDATE OR DELETE ON "Audit"
                FOR EACH ROW EXECUTE FUNCTION deny_ledger_mutation();
                """);
'''

down_sql = r'''            migrationBuilder.Sql("""
                DROP TRIGGER IF EXISTS ledger_immutable ON "Ledger";
                DROP TRIGGER IF EXISTS audit_immutable ON "Audit";
                DROP FUNCTION IF EXISTS deny_ledger_mutation();
                """);

'''

if "CREATE TRIGGER ledger_immutable" not in text:
    if up_marker not in text:
        raise SystemExit("migration Up/Down boundary not found")
    text = text.replace(
        up_marker,
        up_sql + up_marker.replace("        {\n", "        {\n" + down_sql, 1),
        1,
    )

path.write_text(text, encoding="utf-8")
print(path)
