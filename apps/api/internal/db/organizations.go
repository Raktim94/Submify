package db

import (
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
)

// ErrCannotDeleteOwner is returned by DeleteUserInOrganization when the
// target is the organization's owner — an organization must always keep one.
var ErrCannotDeleteOwner = errors.New("cannot delete the organization owner")

// Role values for organization_members.role. Stored as plain TEXT (see
// docs/decisions/0001-workspaces-layer-approach.md) — enforced here at the
// application layer, not by a DB constraint.
const (
	RoleOwner   = "owner"
	RoleAdmin   = "admin"
	RoleManager = "manager"
	RoleMember  = "member"
	RoleViewer  = "viewer"
)

// IsValidInviteRole reports whether role is assignable when inviting a new
// member. RoleOwner is deliberately excluded — an organization has exactly
// one owner, established at creation; transferring ownership is a separate,
// not-yet-built flow, not a side effect of inviting someone.
func IsValidInviteRole(role string) bool {
	switch role {
	case RoleAdmin, RoleManager, RoleMember, RoleViewer:
		return true
	default:
		return false
	}
}

type Organization struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// createOrganizationWithOwner creates a new organization and adds userID as
// its owner, within the caller's transaction.
func createOrganizationWithOwner(tx *sql.Tx, name, userID string) (string, error) {
	orgID := uuid.NewString()
	if _, err := tx.Exec(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, orgID, name); err != nil {
		return "", err
	}
	if _, err := tx.Exec(`
		INSERT INTO organization_members (organization_id, user_id, role)
		VALUES ($1::uuid, $2::uuid, $3)
	`, orgID, userID, RoleOwner); err != nil {
		return "", err
	}
	return orgID, nil
}

// addOrganizationMember adds an existing user to an organization with the
// given role, within the caller's transaction.
func addOrganizationMember(tx *sql.Tx, orgID, userID, role string) error {
	_, err := tx.Exec(`
		INSERT INTO organization_members (organization_id, user_id, role)
		VALUES ($1::uuid, $2::uuid, $3)
	`, orgID, userID, role)
	return err
}

// OrganizationForUser returns the organization a user belongs to. Every user
// is expected to belong to exactly one organization today (multi-org
// membership + an "active organization" switcher is future work) — this
// resolves the earliest membership by join order, which is unambiguous
// while that invariant holds.
func (s *Store) OrganizationForUser(userID string) (Organization, error) {
	var o Organization
	err := s.DB.QueryRow(`
		SELECT o.id, o.name, o.created_at
		FROM organizations o
		JOIN organization_members om ON om.organization_id = o.id
		WHERE om.user_id = $1::uuid
		ORDER BY om.created_at ASC
		LIMIT 1
	`, userID).Scan(&o.ID, &o.Name, &o.CreatedAt)
	return o, err
}

// OrganizationRole returns the caller's role within an organization.
func (s *Store) OrganizationRole(orgID, userID string) (string, error) {
	var role string
	err := s.DB.QueryRow(`
		SELECT role FROM organization_members
		WHERE organization_id = $1::uuid AND user_id = $2::uuid
	`, orgID, userID).Scan(&role)
	return role, err
}

type OrganizationMember struct {
	UserID    string    `json:"user_id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// ListOrganizationMembers lists everyone in an organization, oldest first —
// the org-scoped replacement for the old instance-wide ListUsers.
func (s *Store) ListOrganizationMembers(orgID string) ([]OrganizationMember, error) {
	rows, err := s.DB.Query(`
		SELECT u.id, u.email, COALESCE(u.full_name, ''), om.role, om.created_at
		FROM organization_members om
		JOIN users u ON u.id = om.user_id
		WHERE om.organization_id = $1::uuid
		ORDER BY om.created_at ASC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []OrganizationMember{}
	for rows.Next() {
		var m OrganizationMember
		if err := rows.Scan(&m.UserID, &m.Email, &m.FullName, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// DeleteUserInOrganization removes a member's account, but only if they
// actually belong to orgID (so an admin can never affect another
// organization's user by guessing an id) and are not that organization's
// owner (an organization must always keep its owner).
func (s *Store) DeleteUserInOrganization(orgID, targetUserID string) error {
	role, err := s.OrganizationRole(orgID, targetUserID)
	if err != nil {
		return err
	}
	if role == RoleOwner {
		return ErrCannotDeleteOwner
	}
	res, err := s.DB.Exec(`DELETE FROM users WHERE id = $1::uuid`, targetUserID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
