package db

import (
	"bufio"
	"database/sql"
	"fmt"
	"io"
)

// backupTables is the deliberate allowlist of tables included in a backup —
// see docs/decisions/0004-backup-format-pure-go-json-dump.md for why
// schema_migrations and refresh_sessions are excluded, and why adding a
// new table here must be a deliberate choice made in every future phase
// that introduces persistent state.
var backupTables = []string{
	"organizations",
	"users",
	"organization_members",
	"projects",
	"submissions",
	"system_configs",
}

// BackupTables returns the ordered list of tables a backup covers. Restore
// must insert in this order to satisfy foreign keys.
func BackupTables() []string {
	out := make([]string, len(backupTables))
	copy(out, backupTables)
	return out
}

func isBackupTable(table string) bool {
	for _, t := range backupTables {
		if t == table {
			return true
		}
	}
	return false
}

// DumpTableJSONL writes one JSON object per row of table to w (one row per
// line), via Postgres's own row_to_json — this correctly serializes JSONB
// and TIMESTAMPTZ columns without any per-column Go mapping. Returns the
// number of rows written. table must be in backupTables; this is never
// driven by external input.
func (s *Store) DumpTableJSONL(w io.Writer, table string) (int, error) {
	if !isBackupTable(table) {
		return 0, fmt.Errorf("table %q is not a backup table", table)
	}
	// No ORDER BY: row order doesn't affect restore correctness (each row is
	// an independent insert), and not every backed-up table has an "id"
	// column (organization_members' primary key is composite).
	rows, err := s.DB.Query(`SELECT row_to_json(t) FROM ` + table + ` t`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	bw := bufio.NewWriter(w)
	n := 0
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return n, err
		}
		if _, err := bw.WriteString(line); err != nil {
			return n, err
		}
		if err := bw.WriteByte('\n'); err != nil {
			return n, err
		}
		n++
	}
	if err := rows.Err(); err != nil {
		return n, err
	}
	return n, bw.Flush()
}

// RestoreTableJSONL reads newline-delimited JSON objects from r and inserts
// each as a row into table, within tx, using Postgres's json_populate_record
// to coerce JSON keys/values back into the table's actual column types.
// table must be in backupTables.
func RestoreTableJSONL(tx *sql.Tx, table string, r io.Reader) (int, error) {
	if !isBackupTable(table) {
		return 0, fmt.Errorf("table %q is not a backup table", table)
	}
	stmt := `INSERT INTO ` + table + ` SELECT * FROM json_populate_record(NULL::` + table + `, $1::json)`

	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024) // allow large submission rows
	n := 0
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if _, err := tx.Exec(stmt, line); err != nil {
			return n, fmt.Errorf("restoring %s row %d: %w", table, n+1, err)
		}
		n++
	}
	if err := scanner.Err(); err != nil {
		return n, err
	}
	return n, nil
}
