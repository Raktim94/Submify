package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nodedr/submify/apps/api/internal/keys"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Store struct {
	DB *sql.DB
}

type RefreshSession struct {
	JTI           string
	UserID        string
	ExpiresAt     time.Time
	RevokedAt     sql.NullTime
	ReplacedByJTI sql.NullString
}

type User struct {
	ID               string    `json:"id"`
	Email            string    `json:"email"`
	FullName         string    `json:"full_name"`
	Phone            string    `json:"phone"`
	APIKey           string    `json:"api_key"`
	IsAdmin          bool      `json:"is_admin"`
	PasswordHash     string    `json:"-"`
	TelegramBotToken string    `json:"-"`
	TelegramChatID   string    `json:"-"`
	S3Endpoint       string    `json:"-"`
	S3AccessKey      string    `json:"-"`
	S3SecretKey      string    `json:"-"`
	S3Bucket         string    `json:"-"`
	CreatedAt        time.Time `json:"created_at"`
}

type Project struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	OrganizationID string    `json:"organization_id"`
	Name           string    `json:"name"`
	IsDefault      bool      `json:"is_default"`
	APIKey         string    `json:"api_key"`
	APISecret      string    `json:"api_secret"`
	AllowedOrigins []string  `json:"allowed_origins,omitempty"`
	TelegramBotToken string  `json:"-"`
	TelegramChatID   string  `json:"telegram_chat_id"`
	TelegramConfigured bool  `json:"telegram_configured"`
	S3Endpoint       string  `json:"s3_endpoint"`
	S3AccessKey      string  `json:"-"`
	S3SecretKey      string  `json:"-"`
	S3Bucket         string  `json:"s3_bucket"`
	S3Configured     bool    `json:"s3_configured"`
	PortalSlug         string `json:"portal_slug"`
	PortalEnabled      bool   `json:"portal_enabled"`
	PortalPasswordSet  bool   `json:"portal_password_set"`
	PortalPasswordHash string `json:"-"`
	CreatedAt      time.Time `json:"created_at"`
}

type Submission struct {
	ID        string          `json:"id"`
	ProjectID string          `json:"project_id"`
	Data      json.RawMessage `json:"data"`
	Files     json.RawMessage `json:"files"`
	ClientIP  *string         `json:"client_ip,omitempty"`
	UserAgent *string         `json:"user_agent,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

type SystemConfig struct {
	ID             int       `json:"id"`
	S3Endpoint     string    `json:"s3_endpoint"`
	S3AccessKey    string    `json:"s3_access_key"`
	S3SecretKey    string    `json:"s3_secret_key"`
	S3Bucket       string    `json:"s3_bucket"`
	TelegramToken  string    `json:"telegram_bot_token"`
	TelegramChatID string    `json:"telegram_chat_id"`
	AdminEmail     string    `json:"admin_email"`
	AdminHash      string    `json:"admin_password_hash"`
	UpdateAvail    bool      `json:"update_available"`
	LatestVersion  string    `json:"latest_version"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func Open(databaseURL string) (*Store, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &Store{DB: db}, nil
}

func (s *Store) BootstrapComplete() (bool, error) {
	var count int
	if err := s.DB.QueryRow("SELECT COUNT(*) FROM system_configs").Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

// HasAnyUser is true once at least one account exists (registration or legacy setup).
func (s *Store) HasAnyUser() (bool, error) {
	var n int
	if err := s.DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *Store) CreateInitialSystemConfig(cfg SystemConfig) error {
	complete, err := s.BootstrapComplete()
	if err != nil {
		return err
	}
	if complete {
		return errors.New("system already initialized")
	}

	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		INSERT INTO system_configs (
			id, s3_endpoint, s3_access_key, s3_secret_key, s3_bucket,
			telegram_bot_token, telegram_chat_id, admin_email, admin_password_hash,
			update_available, latest_version
		) VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,FALSE,'')
	`, cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.TelegramToken, cfg.TelegramChatID, cfg.AdminEmail, cfg.AdminHash); err != nil {
		return err
	}

	userID := uuid.NewString()
	userAPIKey := uuid.NewString()
	pk, err := keys.NewAPIKey()
	if err != nil {
		return err
	}
	sk, err := keys.NewAPISecret()
	if err != nil {
		return err
	}

	if _, err := tx.Exec(`
		INSERT INTO users(id, email, password_hash, api_key, full_name, phone)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, cfg.AdminEmail, cfg.AdminHash, userAPIKey, cfg.AdminEmail, ""); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		INSERT INTO projects(id, user_id, name, api_key, api_secret, is_default)
		VALUES (gen_random_uuid(), $1, 'Default', $2, $3, TRUE)
	`, userID, pk, sk); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) GetSystemConfig() (SystemConfig, error) {
	var cfg SystemConfig
	err := s.DB.QueryRow(`
		SELECT id,s3_endpoint,s3_access_key,s3_secret_key,s3_bucket,
		telegram_bot_token,telegram_chat_id,admin_email,admin_password_hash,
		update_available,latest_version,updated_at
		FROM system_configs WHERE id=1
	`).Scan(
		&cfg.ID, &cfg.S3Endpoint, &cfg.S3AccessKey, &cfg.S3SecretKey, &cfg.S3Bucket,
		&cfg.TelegramToken, &cfg.TelegramChatID, &cfg.AdminEmail, &cfg.AdminHash,
		&cfg.UpdateAvail, &cfg.LatestVersion, &cfg.UpdatedAt,
	)
	return cfg, err
}

func (s *Store) UpdateSystemConfig(cfg SystemConfig) error {
	_, err := s.DB.Exec(`
		UPDATE system_configs
		SET s3_endpoint=$1,s3_access_key=$2,s3_secret_key=$3,s3_bucket=$4,
		telegram_bot_token=$5,telegram_chat_id=$6,updated_at=NOW()
		WHERE id=1
	`, cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.TelegramToken, cfg.TelegramChatID)
	return err
}

func scanUser(row *sql.Row) (User, error) {
	var u User
	err := row.Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.APIKey,
		&u.FullName, &u.Phone, &u.IsAdmin,
		&u.TelegramBotToken, &u.TelegramChatID,
		&u.S3Endpoint, &u.S3AccessKey, &u.S3SecretKey, &u.S3Bucket,
		&u.CreatedAt,
	)
	return u, err
}

const userSelect = `id,email,password_hash,api_key,
COALESCE(full_name,''),COALESCE(phone,''),is_admin,
COALESCE(telegram_bot_token,''),COALESCE(telegram_chat_id,''),
COALESCE(s3_endpoint,''),COALESCE(s3_access_key,''),COALESCE(s3_secret_key,''),COALESCE(s3_bucket,''),
created_at`

func (s *Store) FindUserByEmail(email string) (User, error) {
	return scanUser(s.DB.QueryRow(`SELECT `+userSelect+` FROM users WHERE email=$1`, email))
}

func (s *Store) FindUserByID(id string) (User, error) {
	return scanUser(s.DB.QueryRow(`SELECT `+userSelect+` FROM users WHERE id=$1`, id))
}

func (s *Store) FindUserByAPIKey(key string) (User, error) {
	return scanUser(s.DB.QueryRow(`SELECT `+userSelect+` FROM users WHERE api_key=$1`, key))
}

// RegisterUser creates the first account of a brand-new organization
// (always its owner) with that organization's default inbox project, and
// ensures system_configs row 1 exists for update metadata. is_admin is
// still set for backward compatibility with the existing instance-wide
// AdminGuard — see docs/roadmap/00-MASTER-PLAN.md for the follow-up to
// replace that with organization-role checks everywhere.
func (s *Store) RegisterUser(fullName, phone, email, passwordHash string) (User, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()

	userID := uuid.NewString()
	userAPIKey := uuid.NewString()
	pk, err := keys.NewAPIKey()
	if err != nil {
		return User{}, err
	}
	sk, err := keys.NewAPISecret()
	if err != nil {
		return User{}, err
	}

	if _, err := tx.Exec(`
		INSERT INTO users(id, email, password_hash, api_key, full_name, phone, is_admin)
		VALUES ($1,$2,$3,$4,$5,$6,TRUE)
	`, userID, email, passwordHash, userAPIKey, fullName, phone); err != nil {
		return User{}, err
	}

	orgID, err := createOrganizationWithOwner(tx, "My Organization", userID)
	if err != nil {
		return User{}, err
	}

	if _, err := tx.Exec(`
		INSERT INTO projects(id, user_id, organization_id, name, api_key, api_secret, is_default)
		VALUES (gen_random_uuid(), $1, $2, 'Default', $3, $4, TRUE)
	`, userID, orgID, pk, sk); err != nil {
		return User{}, err
	}

	if _, err := tx.Exec(`
		INSERT INTO system_configs (id, s3_endpoint, s3_access_key, s3_secret_key, s3_bucket, telegram_bot_token, telegram_chat_id, admin_email, admin_password_hash, update_available, latest_version)
		VALUES (1, '', '', '', '', '', '', $1, $2, FALSE, '')
		ON CONFLICT (id) DO NOTHING
	`, email, passwordHash); err != nil {
		return User{}, err
	}

	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return s.FindUserByID(userID)
}

// CreateUserByAdmin adds a new account to an existing organization with the
// given role — an invite, not a second organization. It deliberately does
// not create a project: the invited member gets access to the
// organization's existing projects (see
// docs/decisions/0002-organization-scoped-default-project.md).
func (s *Store) CreateUserByAdmin(orgID, fullName, phone, email, passwordHash, role string) (User, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()

	userID := uuid.NewString()
	userAPIKey := uuid.NewString()

	if _, err := tx.Exec(`
		INSERT INTO users(id, email, password_hash, api_key, full_name, phone, is_admin)
		VALUES ($1,$2,$3,$4,$5,$6,FALSE)
	`, userID, email, passwordHash, userAPIKey, fullName, phone); err != nil {
		return User{}, err
	}

	if err := addOrganizationMember(tx, orgID, userID, role); err != nil {
		return User{}, err
	}

	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return s.FindUserByID(userID)
}

// UpdateUserIntegrations stores optional Telegram and S3 settings for large uploads and notifications.
func (s *Store) UpdateUserIntegrations(userID, telegramToken, telegramChatID, s3Endpoint, s3Access, s3Secret, s3Bucket string) error {
	_, err := s.DB.Exec(`
		UPDATE users SET
			telegram_bot_token = NULLIF($2, ''),
			telegram_chat_id = NULLIF($3, ''),
			s3_endpoint = NULLIF($4, ''),
			s3_access_key = NULLIF($5, ''),
			s3_secret_key = NULLIF($6, ''),
			s3_bucket = NULLIF($7, '')
		WHERE id = $1::uuid
	`, userID, telegramToken, telegramChatID, s3Endpoint, s3Access, s3Secret, s3Bucket)
	return err
}

func (s *Store) UpdateUserPassword(userID, passwordHash string) error {
	res, err := s.DB.Exec(`
		UPDATE users
		SET password_hash = $2
		WHERE id = $1::uuid
	`, userID, strings.TrimSpace(passwordHash))
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) UpdateUserAPIKey(userID, newAPIKey string) error {
	res, err := s.DB.Exec(`
		UPDATE users
		SET api_key = $2
		WHERE id = $1::uuid
	`, userID, strings.TrimSpace(newAPIKey))
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

const projectSelect = `id, user_id, organization_id, name, is_default, api_key, api_secret, COALESCE(allowed_origins, ''), COALESCE(telegram_bot_token, ''), COALESCE(telegram_chat_id, ''), COALESCE(s3_endpoint, ''), COALESCE(s3_access_key, ''), COALESCE(s3_secret_key, ''), COALESCE(s3_bucket, ''), COALESCE(portal_slug, ''), portal_enabled, COALESCE(portal_password_hash, ''), created_at`

func parseOriginsJSON(s string) ([]string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	var out []string
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func hydrateProject(p *Project, originsRaw string) error {
	origins, err := parseOriginsJSON(originsRaw)
	if err != nil {
		return err
	}
	p.AllowedOrigins = origins
	p.TelegramConfigured = strings.TrimSpace(p.TelegramBotToken) != "" && strings.TrimSpace(p.TelegramChatID) != ""
	p.S3Configured = strings.TrimSpace(p.S3Endpoint) != "" && strings.TrimSpace(p.S3Bucket) != "" &&
		strings.TrimSpace(p.S3AccessKey) != "" && strings.TrimSpace(p.S3SecretKey) != ""
	p.PortalPasswordSet = strings.TrimSpace(p.PortalPasswordHash) != ""
	return nil
}

func projectFromRow(row *sql.Row) (Project, error) {
	var p Project
	var originsRaw string
	err := row.Scan(&p.ID, &p.UserID, &p.OrganizationID, &p.Name, &p.IsDefault, &p.APIKey, &p.APISecret, &originsRaw, &p.TelegramBotToken, &p.TelegramChatID, &p.S3Endpoint, &p.S3AccessKey, &p.S3SecretKey, &p.S3Bucket, &p.PortalSlug, &p.PortalEnabled, &p.PortalPasswordHash, &p.CreatedAt)
	if err != nil {
		return Project{}, err
	}
	if err := hydrateProject(&p, originsRaw); err != nil {
		return Project{}, err
	}
	return p, nil
}

func projectFromRows(rows *sql.Rows) (Project, error) {
	var p Project
	var originsRaw string
	err := rows.Scan(&p.ID, &p.UserID, &p.OrganizationID, &p.Name, &p.IsDefault, &p.APIKey, &p.APISecret, &originsRaw, &p.TelegramBotToken, &p.TelegramChatID, &p.S3Endpoint, &p.S3AccessKey, &p.S3SecretKey, &p.S3Bucket, &p.PortalSlug, &p.PortalEnabled, &p.PortalPasswordHash, &p.CreatedAt)
	if err != nil {
		return Project{}, err
	}
	if err := hydrateProject(&p, originsRaw); err != nil {
		return Project{}, err
	}
	return p, nil
}

// CreateProject creates a project owned by orgID (visible to every member of
// that organization), recording createdByUserID for provenance only — it is
// not used for access control. See docs/decisions/0001 and 0002.
func (s *Store) CreateProject(orgID, createdByUserID, name string, isDefault bool) (Project, error) {
	pk, err := keys.NewAPIKey()
	if err != nil {
		return Project{}, err
	}
	sk, err := keys.NewAPISecret()
	if err != nil {
		return Project{}, err
	}
	row := s.DB.QueryRow(`
		INSERT INTO projects(id,user_id,organization_id,name,api_key,api_secret,is_default)
		VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6)
		RETURNING `+projectSelect+`
	`, createdByUserID, orgID, name, pk, sk, isDefault)
	return projectFromRow(row)
}

func (s *Store) DefaultInboxProject(orgID string) (Project, error) {
	row := s.DB.QueryRow(`
		SELECT `+projectSelect+`
		FROM projects WHERE organization_id=$1 AND is_default=TRUE LIMIT 1
	`, orgID)
	return projectFromRow(row)
}

func (s *Store) EnsureDefaultInboxProject(orgID, createdByUserID string) (Project, error) {
	p, err := s.DefaultInboxProject(orgID)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Project{}, err
	}
	return s.CreateProject(orgID, createdByUserID, "Default", true)
}

// ListProjects lists every project visible to organization orgID — i.e.
// every project any of its members can see, not just ones a specific user
// created. See docs/decisions/0001-workspaces-layer-approach.md.
func (s *Store) ListProjects(orgID string) ([]Project, error) {
	rows, err := s.DB.Query(`
		SELECT `+projectSelect+`
		FROM projects WHERE organization_id=$1 ORDER BY is_default DESC, created_at DESC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		p, err := projectFromRows(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (s *Store) UpdateProjectName(orgID, projectID, name string) error {
	res, err := s.DB.Exec(`UPDATE projects SET name=$1 WHERE id=$2 AND organization_id=$3`, name, projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) RegenerateProjectKeys(orgID, projectID, newAPIKey, newAPISecret string) error {
	res, err := s.DB.Exec(`UPDATE projects SET api_key=$1, api_secret=$2 WHERE id=$3 AND organization_id=$4`, newAPIKey, newAPISecret, projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) UpdateProjectAllowedOrigins(orgID, projectID string, origins []string) error {
	var payload interface{}
	if len(origins) == 0 {
		payload = nil
	} else {
		b, err := json.Marshal(origins)
		if err != nil {
			return err
		}
		payload = string(b)
	}
	res, err := s.DB.Exec(`UPDATE projects SET allowed_origins=$1 WHERE id=$2 AND organization_id=$3`, payload, projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) UpdateProjectTelegram(orgID, projectID, telegramToken, telegramChatID string) error {
	res, err := s.DB.Exec(`
		UPDATE projects
		SET telegram_bot_token = NULLIF($1, ''),
		    telegram_chat_id = NULLIF($2, '')
		WHERE id=$3 AND organization_id=$4
	`, strings.TrimSpace(telegramToken), strings.TrimSpace(telegramChatID), projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) UpdateProjectStorage(orgID, projectID, endpoint, accessKey, secretKey, bucket string) error {
	res, err := s.DB.Exec(`
		UPDATE projects
		SET s3_endpoint = NULLIF($1, ''),
		    s3_access_key = NULLIF($2, ''),
		    s3_secret_key = NULLIF($3, ''),
		    s3_bucket = NULLIF($4, '')
		WHERE id=$5 AND organization_id=$6
	`, strings.TrimSpace(endpoint), strings.TrimSpace(accessKey), strings.TrimSpace(secretKey), strings.TrimSpace(bucket), projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ProjectOwnedBy resolves a project only if it belongs to orgID — this is
// the tenant-isolation boundary for every project-scoped endpoint.
func (s *Store) ProjectOwnedBy(orgID, projectID string) (Project, error) {
	row := s.DB.QueryRow(`SELECT `+projectSelect+` FROM projects WHERE id=$1 AND organization_id=$2`, projectID, orgID)
	return projectFromRow(row)
}

// FindProjectByPublicKey resolves a project by pk_live_* key, or legacy UUID string (normalized to pk_live_ + hex).
func (s *Store) FindProjectByPublicKey(header string) (Project, error) {
	header = strings.TrimSpace(header)
	if header == "" {
		return Project{}, sql.ErrNoRows
	}
	row := s.DB.QueryRow(`SELECT `+projectSelect+` FROM projects WHERE api_key=$1`, header)
	p, err := projectFromRow(row)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Project{}, err
	}
	if id, err := uuid.Parse(header); err == nil {
		normalized := "pk_live_" + strings.ReplaceAll(id.String(), "-", "")
		row2 := s.DB.QueryRow(`SELECT `+projectSelect+` FROM projects WHERE api_key=$1`, normalized)
		return projectFromRow(row2)
	}
	return Project{}, sql.ErrNoRows
}

// FindProjectByPortalSlug resolves the project served at /<slug> (case-insensitive).
func (s *Store) FindProjectByPortalSlug(slug string) (Project, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return Project{}, sql.ErrNoRows
	}
	row := s.DB.QueryRow(`SELECT `+projectSelect+` FROM projects WHERE lower(portal_slug)=lower($1)`, slug)
	return projectFromRow(row)
}

// FindProjectByID resolves a project by id without an owner scope. Used by the portal
// guard, which is already scoped by a project-bound token.
func (s *Store) FindProjectByID(projectID string) (Project, error) {
	row := s.DB.QueryRow(`SELECT `+projectSelect+` FROM projects WHERE id=$1`, projectID)
	return projectFromRow(row)
}

// PortalSlugTaken reports whether another project already uses the given slug.
func (s *Store) PortalSlugTaken(slug, exceptProjectID string) (bool, error) {
	var exists bool
	err := s.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM projects WHERE lower(portal_slug)=lower($1) AND id <> $2::uuid)`,
		strings.TrimSpace(slug), exceptProjectID,
	).Scan(&exists)
	return exists, err
}

func (s *Store) UpdateProjectPortalSlug(orgID, projectID, slug string) error {
	res, err := s.DB.Exec(`UPDATE projects SET portal_slug=NULLIF($1,'') WHERE id=$2 AND organization_id=$3`, strings.TrimSpace(slug), projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) UpdateProjectPortalPassword(orgID, projectID, passwordHash string) error {
	res, err := s.DB.Exec(`UPDATE projects SET portal_password_hash=NULLIF($1,'') WHERE id=$2 AND organization_id=$3`, strings.TrimSpace(passwordHash), projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) SetProjectPortalEnabled(orgID, projectID string, enabled bool) error {
	res, err := s.DB.Exec(`UPDATE projects SET portal_enabled=$1 WHERE id=$2 AND organization_id=$3`, enabled, projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) CountSubmissions(projectID string) (int, error) {
	var count int
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM submissions WHERE project_id=$1`, projectID).Scan(&count)
	return count, err
}

// LatestSubmissionSnapshot is the newest submission across all projects owned by a user (for dashboard alerts).
type LatestSubmissionSnapshot struct {
	CreatedAt   time.Time `json:"at"`
	ProjectID   string    `json:"project_id"`
	ProjectName string    `json:"project_name"`
}

// LatestSubmissionSnapshotForOrganization returns nil, nil when the
// organization has no submissions yet across any of its projects.
func (s *Store) LatestSubmissionSnapshotForOrganization(orgID string) (*LatestSubmissionSnapshot, error) {
	var snap LatestSubmissionSnapshot
	err := s.DB.QueryRow(`
		SELECT s.created_at, s.project_id, p.name
		FROM submissions s
		INNER JOIN projects p ON p.id = s.project_id AND p.organization_id = $1::uuid
		ORDER BY s.created_at DESC
		LIMIT 1
	`, orgID).Scan(&snap.CreatedAt, &snap.ProjectID, &snap.ProjectName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &snap, nil
}

func (s *Store) InsertSubmission(projectID string, data, files json.RawMessage, clientIP, userAgent string) (Submission, error) {
	var sub Submission
	var ipNS, uaNS sql.NullString
	err := s.DB.QueryRow(`
		INSERT INTO submissions(id,project_id,data,files,client_ip,user_agent)
		VALUES (gen_random_uuid(),$1,$2,$3,NULLIF($4,''),NULLIF($5,''))
		RETURNING id,project_id,data,files,client_ip,user_agent,created_at
	`, projectID, data, files, clientIP, userAgent).Scan(&sub.ID, &sub.ProjectID, &sub.Data, &sub.Files, &ipNS, &uaNS, &sub.CreatedAt)
	if ipNS.Valid {
		s := ipNS.String
		sub.ClientIP = &s
	}
	if uaNS.Valid {
		s := uaNS.String
		sub.UserAgent = &s
	}
	return sub, err
}

func (s *Store) ListSubmissions(projectID string, limit, offset int) ([]Submission, error) {
	rows, err := s.DB.Query(`
		SELECT id,project_id,data,files,client_ip,user_agent,created_at
		FROM submissions
		WHERE project_id=$1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, projectID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Submission{}
	for rows.Next() {
		var sub Submission
		var ipNS, uaNS sql.NullString
		if err := rows.Scan(&sub.ID, &sub.ProjectID, &sub.Data, &sub.Files, &ipNS, &uaNS, &sub.CreatedAt); err != nil {
			return nil, err
		}
		if ipNS.Valid {
			s := ipNS.String
			sub.ClientIP = &s
		}
		if uaNS.Valid {
			s := uaNS.String
			sub.UserAgent = &s
		}
		items = append(items, sub)
	}
	return items, rows.Err()
}

func (s *Store) DeleteSubmissions(projectID string, ids []string) (int64, error) {
	res, err := s.DB.Exec(`DELETE FROM submissions WHERE project_id=$1 AND id = ANY($2::uuid[])`, projectID, ids)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) DeleteProject(orgID, projectID string) error {
	p, err := s.ProjectOwnedBy(orgID, projectID)
	if err != nil {
		return err
	}
	if p.IsDefault {
		return errors.New("cannot delete default project")
	}
	res, err := s.DB.Exec(`DELETE FROM projects WHERE id=$1 AND organization_id=$2`, projectID, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) CreateRefreshSession(jti, userID string, expiresAt time.Time) error {
	_, err := s.DB.Exec(`
		INSERT INTO refresh_sessions (jti, user_id, expires_at)
		VALUES ($1, $2::uuid, $3)
	`, jti, userID, expiresAt.UTC())
	return err
}

func (s *Store) RefreshSessionByJTI(jti string) (RefreshSession, error) {
	var rs RefreshSession
	err := s.DB.QueryRow(`
		SELECT jti, user_id::text, expires_at, revoked_at, replaced_by_jti
		FROM refresh_sessions
		WHERE jti = $1
	`, jti).Scan(&rs.JTI, &rs.UserID, &rs.ExpiresAt, &rs.RevokedAt, &rs.ReplacedByJTI)
	return rs, err
}

func (s *Store) RotateRefreshSession(oldJTI, newJTI, userID string, newExpiresAt time.Time) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE refresh_sessions
		SET revoked_at = NOW(), replaced_by_jti = $2
		WHERE jti = $1
		  AND user_id = $3::uuid
		  AND revoked_at IS NULL
		  AND expires_at > NOW()
	`, oldJTI, newJTI, userID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}

	if _, err := tx.Exec(`
		INSERT INTO refresh_sessions (jti, user_id, expires_at)
		VALUES ($1, $2::uuid, $3)
	`, newJTI, userID, newExpiresAt.UTC()); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) RevokeRefreshSession(jti, userID string) error {
	res, err := s.DB.Exec(`
		UPDATE refresh_sessions
		SET revoked_at = NOW()
		WHERE jti = $1
		  AND user_id = $2::uuid
		  AND revoked_at IS NULL
	`, jti, userID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

