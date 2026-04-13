package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type Store struct {
	DB *sql.DB
}

type User struct {
	ID               string    `json:"id"`
	Email            string    `json:"email"`
	FullName         string    `json:"full_name"`
	Phone            string    `json:"phone"`
	APIKey           string    `json:"api_key"`
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
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	Name         string    `json:"name"`
	PublicAPIKey string    `json:"public_api_key"`
	CreatedAt    time.Time `json:"created_at"`
}

type Submission struct {
	ID        string          `json:"id"`
	ProjectID string          `json:"project_id"`
	Data      json.RawMessage `json:"data"`
	Files     json.RawMessage `json:"files"`
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
	apiKey := uuid.NewString()
	internalProjectKey := uuid.NewString()

	if _, err := tx.Exec(`
		INSERT INTO users(id, email, password_hash, api_key, full_name, phone)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, cfg.AdminEmail, cfg.AdminHash, apiKey, cfg.AdminEmail, ""); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		INSERT INTO projects(id, user_id, name, public_api_key, is_default)
		VALUES (gen_random_uuid(), $1, 'Default', $2, TRUE)
	`, userID, internalProjectKey); err != nil {
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

func (s *Store) SetUpdateStatus(available bool, latestVersion string) error {
	_, err := s.DB.Exec("UPDATE system_configs SET update_available=$1, latest_version=$2, updated_at=NOW() WHERE id=1", available, latestVersion)
	return err
}

func scanUser(row *sql.Row) (User, error) {
	var u User
	err := row.Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.APIKey,
		&u.FullName, &u.Phone,
		&u.TelegramBotToken, &u.TelegramChatID,
		&u.S3Endpoint, &u.S3AccessKey, &u.S3SecretKey, &u.S3Bucket,
		&u.CreatedAt,
	)
	return u, err
}

const userSelect = `id,email,password_hash,api_key,
COALESCE(full_name,''),COALESCE(phone,''),
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

// RegisterUser creates the first (or additional) account with a default inbox project and ensures system_configs row 1 exists for update metadata.
func (s *Store) RegisterUser(fullName, phone, email, passwordHash string) (User, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()

	userID := uuid.NewString()
	apiKey := uuid.NewString()
	internalProjectKey := uuid.NewString()

	if _, err := tx.Exec(`
		INSERT INTO users(id, email, password_hash, api_key, full_name, phone)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, userID, email, passwordHash, apiKey, fullName, phone); err != nil {
		return User{}, err
	}

	if _, err := tx.Exec(`
		INSERT INTO projects(id, user_id, name, public_api_key, is_default)
		VALUES (gen_random_uuid(), $1, 'Default', $2, TRUE)
	`, userID, internalProjectKey); err != nil {
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

func (s *Store) CreateProject(userID, name, apiKey string, isDefault bool) (Project, error) {
	var p Project
	err := s.DB.QueryRow(`
		INSERT INTO projects(id,user_id,name,public_api_key,is_default)
		VALUES (gen_random_uuid(),$1,$2,$3,$4)
		RETURNING id,user_id,name,public_api_key,created_at
	`, userID, name, apiKey, isDefault).Scan(&p.ID, &p.UserID, &p.Name, &p.PublicAPIKey, &p.CreatedAt)
	return p, err
}

func (s *Store) DefaultInboxProject(userID string) (Project, error) {
	var p Project
	err := s.DB.QueryRow(`
		SELECT id,user_id,name,public_api_key,created_at
		FROM projects WHERE user_id=$1 AND is_default=TRUE LIMIT 1
	`, userID).Scan(&p.ID, &p.UserID, &p.Name, &p.PublicAPIKey, &p.CreatedAt)
	return p, err
}

func (s *Store) EnsureDefaultInboxProject(userID string) (Project, error) {
	p, err := s.DefaultInboxProject(userID)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Project{}, err
	}
	return s.CreateProject(userID, "Default", uuid.NewString(), true)
}

func (s *Store) ListProjects(userID string) ([]Project, error) {
	rows, err := s.DB.Query(`SELECT id,user_id,name,public_api_key,created_at FROM projects WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.PublicAPIKey, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (s *Store) UpdateProjectName(userID, projectID, name string) error {
	res, err := s.DB.Exec(`UPDATE projects SET name=$1 WHERE id=$2 AND user_id=$3`, name, projectID, userID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) RegenerateAPIKey(userID, projectID, newKey string) error {
	res, err := s.DB.Exec(`UPDATE projects SET public_api_key=$1 WHERE id=$2 AND user_id=$3`, newKey, projectID, userID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) ProjectOwnedBy(userID, projectID string) (Project, error) {
	var p Project
	err := s.DB.QueryRow(`SELECT id,user_id,name,public_api_key,created_at FROM projects WHERE id=$1 AND user_id=$2`, projectID, userID).Scan(&p.ID, &p.UserID, &p.Name, &p.PublicAPIKey, &p.CreatedAt)
	return p, err
}

func (s *Store) FindProjectByAPIKey(apiKey string) (Project, error) {
	var p Project
	err := s.DB.QueryRow(`SELECT id,user_id,name,public_api_key,created_at FROM projects WHERE public_api_key=$1`, apiKey).Scan(&p.ID, &p.UserID, &p.Name, &p.PublicAPIKey, &p.CreatedAt)
	return p, err
}

func (s *Store) CountSubmissions(projectID string) (int, error) {
	var count int
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM submissions WHERE project_id=$1`, projectID).Scan(&count)
	return count, err
}

func (s *Store) InsertSubmission(projectID string, data, files json.RawMessage) (Submission, error) {
	var sub Submission
	err := s.DB.QueryRow(`
		INSERT INTO submissions(id,project_id,data,files)
		VALUES (gen_random_uuid(),$1,$2,$3)
		RETURNING id,project_id,data,files,created_at
	`, projectID, data, files).Scan(&sub.ID, &sub.ProjectID, &sub.Data, &sub.Files, &sub.CreatedAt)
	return sub, err
}

func (s *Store) ListSubmissions(projectID string, limit, offset int) ([]Submission, error) {
	rows, err := s.DB.Query(`
		SELECT id,project_id,data,files,created_at
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
		if err := rows.Scan(&sub.ID, &sub.ProjectID, &sub.Data, &sub.Files, &sub.CreatedAt); err != nil {
			return nil, err
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

