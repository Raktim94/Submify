package storage

import (
	"context"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type PresignInput struct {
	Endpoint      string
	AccessKey     string
	SecretKey     string
	Bucket        string
	ProjectID     string
	Filename      string
	ExpiryMinutes int
}

type PresignResult struct {
	UploadURL string    `json:"upload_url"`
	ObjectKey string    `json:"object_key"`
	ExpiresAt time.Time `json:"expires_at"`
}

func client(endpoint, accessKey, secretKey string) (*minio.Client, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	secure := u.Scheme == "https"
	host := u.Host
	if host == "" {
		host = endpoint
	}
	return minio.New(host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
}

func CheckBucket(ctx context.Context, endpoint, accessKey, secretKey, bucket string) error {
	c, err := client(endpoint, accessKey, secretKey)
	if err != nil {
		return err
	}
	_, err = c.BucketExists(ctx, bucket)
	return err
}

func PresignUpload(ctx context.Context, in PresignInput) (PresignResult, error) {
	c, err := client(in.Endpoint, in.AccessKey, in.SecretKey)
	if err != nil {
		return PresignResult{}, err
	}

	ext := filepath.Ext(in.Filename)
	key := strings.Join([]string{
		in.ProjectID,
		time.Now().UTC().Format("2006-01-02"),
		uuid.NewString() + ext,
	}, "/")

	expires := time.Duration(in.ExpiryMinutes) * time.Minute
	uploadURL, err := c.PresignedPutObject(ctx, in.Bucket, key, expires)
	if err != nil {
		return PresignResult{}, err
	}

	return PresignResult{
		UploadURL: uploadURL.String(),
		ObjectKey: key,
		ExpiresAt: time.Now().UTC().Add(expires),
	}, nil
}
