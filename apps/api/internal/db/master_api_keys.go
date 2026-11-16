package db

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// MasterAPIKey is the listable metadata of a master API key. The plaintext
// key is never stored; KeyPrefix is enough for a human to recognise it.
type MasterAPIKey struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	KeyPrefix  string     `json:"key_prefix"`
	UserID     string     `json:"user_id"`
	UserEmail  string     `json:"user_email"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

// MasterKeyPrincipal is what a valid key authenticates as.
type MasterKeyPrincipal struct {
	KeyID          string
	UserID         string
	Email          string
	OrganizationID string
}

func (s *Store) CreateMasterAPIKey(orgID, userID, name, prefix, hash string, expiresAt *time.Time) (MasterAPIKey, error) {
	id := uuid.NewString()
	var k MasterAPIKey
	err := s.DB.QueryRow(`
		INSERT INTO master_api_keys (id, organization_id, user_id, name, key_prefix, key_hash, expires_at)
		VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7)
		RETURNING id, name, key_prefix, user_id, created_at, expires_at
	`, id, orgID, userID, name, prefix, hash, expiresAt).Scan(&k.ID, &k.Name, &k.KeyPrefix, &k.UserID, &k.CreatedAt, &k.ExpiresAt)
	if err != nil {
		return MasterAPIKey{}, err
	}
	_ = s.DB.QueryRow(`SELECT email FROM users WHERE id=$1`, userID).Scan(&k.UserEmail)
	return k, nil
}

// ListMasterAPIKeys returns the organization's active (unrevoked) keys.
func (s *Store) ListMasterAPIKeys(orgID string) ([]MasterAPIKey, error) {
	rows, err := s.DB.Query(`
		SELECT k.id, k.name, k.key_prefix, k.user_id, u.email, k.created_at, k.expires_at, k.last_used_at
		FROM master_api_keys k JOIN users u ON u.id = k.user_id
		WHERE k.organization_id = $1::uuid AND k.revoked_at IS NULL
		ORDER BY k.created_at DESC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MasterAPIKey{}
	for rows.Next() {
		var k MasterAPIKey
		if err := rows.Scan(&k.ID, &k.Name, &k.KeyPrefix, &k.UserID, &k.UserEmail, &k.CreatedAt, &k.ExpiresAt, &k.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// RevokeMasterAPIKey revokes a key inside the organization. Returns
// sql.ErrNoRows when no active key with that id exists there.
func (s *Store) RevokeMasterAPIKey(orgID, keyID string) error {
	if _, err := uuid.Parse(keyID); err != nil {
		return sql.ErrNoRows
	}
	res, err := s.DB.Exec(`
		UPDATE master_api_keys SET revoked_at = NOW()
		WHERE id = $1::uuid AND organization_id = $2::uuid AND revoked_at IS NULL
	`, keyID, orgID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ResolveMasterAPIKey looks up an active, unexpired key by hash. The owning
// user must still be a member of the key's organization, so removing a
// teammate also kills every key they created (the FK cascade covers a
// deleted user; this covers a user moved out of the organization).
func (s *Store) ResolveMasterAPIKey(hash string) (MasterKeyPrincipal, error) {
	var p MasterKeyPrincipal
	var lastUsed sql.NullTime
	err := s.DB.QueryRow(`
		SELECT k.id, k.user_id, u.email, k.organization_id, k.last_used_at
		FROM master_api_keys k
		JOIN users u ON u.id = k.user_id
		JOIN organization_members m ON m.organization_id = k.organization_id AND m.user_id = k.user_id
		WHERE k.key_hash = $1 AND k.revoked_at IS NULL
		  AND (k.expires_at IS NULL OR k.expires_at > NOW())
	`, hash).Scan(&p.KeyID, &p.UserID, &p.Email, &p.OrganizationID, &lastUsed)
	if err != nil {
		return MasterKeyPrincipal{}, err
	}
	// Throttle the write: one UPDATE per key per minute is plenty for an audit trail.
	if !lastUsed.Valid || time.Since(lastUsed.Time) > time.Minute {
		_, _ = s.DB.Exec(`UPDATE master_api_keys SET last_used_at = NOW() WHERE id = $1::uuid`, p.KeyID)
	}
	return p, nil
}
